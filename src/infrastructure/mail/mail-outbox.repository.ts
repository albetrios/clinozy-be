import { and, asc, count, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import {
  assertWorkerDatabaseContext,
  isWorkerRuntime,
  resolveRepositoryDatabaseHandle,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import { mail_outbox } from '@/infrastructure/mail/mail-outbox.schema.js';
import type { MailEnqueueInput } from '@/infrastructure/mail/queues/mail.queue.js';

/**
 * Outcome of {@link tryClaimPendingMailOutbox}: `claimed` when this caller owns the
 * row, `in_flight` when another worker holds it (status `sending`), `already_sent`
 * when delivery completed, `failed` when the row reached the terminal `failed` state
 * (body already scrubbed — not replayable), or `not_found` when the outbox row was
 * deleted/expired.
 */
export type MailOutboxClaimResult =
  | 'claimed'
  | 'in_flight'
  | 'already_sent'
  | 'failed'
  | 'not_found';

function mailOutboxDatabase() {
  if (isWorkerRuntime()) {
    assertWorkerDatabaseContext(['system_table']);
  }
  return resolveRepositoryDatabaseHandle(undefined);
}

/**
 * Inserts a `pending` row into `auth.mail_outbox` (transactional outbox pattern) —
 * enrolls in the active unit-of-work transaction when present so the row commits only
 * if the surrounding business write succeeds. Returns the row's token
 * (`resend_idempotency_token`), the handle the BullMQ job carries.
 *
 * @remarks
 * reaudit-#4: when `data.dedupeKey` is supplied, the insert is idempotent on that key
 * (`ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`). A concurrent
 * producer using the same key gets back the EXISTING row's token instead of creating a
 * second row, so two redelivered runs of the same notification converge on one outbox
 * row → one email. No lost-email risk: the insert is always attempted. The token, not the
 * bigserial, leaves Postgres: the id restarts after a restore while queued jobs live on.
 */
export async function insertMailOutbox(data: MailEnqueueInput): Promise<string> {
  const toAddresses = Array.isArray(data.to) ? data.to : [data.to];
  const insertQuery = mailOutboxDatabase().insert(mail_outbox).values({
    to_addresses: toAddresses,
    subject: data.subject,
    html: data.html,
    text_body: data.text,
    reply_to: data.replyTo,
    tags: data.tags,
    status: 'pending',
    dedupe_key: data.dedupeKey,
  });
  const rows = data.dedupeKey
    ? await insertQuery
        .onConflictDoNothing({
          target: mail_outbox.dedupe_key,
          where: isNotNull(mail_outbox.dedupe_key),
        })
        .returning({ token: mail_outbox.resend_idempotency_token })
    : await insertQuery.returning({ token: mail_outbox.resend_idempotency_token });

  let mailOutboxToken = rows[0]?.token;
  if (mailOutboxToken === undefined && data.dedupeKey) {
    // Conflict — another producer already recorded this dedupe_key. Resolve to that row's token
    // so the caller dispatches the SAME (idempotent) outbox row rather than failing.
    const existing = await mailOutboxDatabase()
      .select({ token: mail_outbox.resend_idempotency_token })
      .from(mail_outbox)
      .where(eq(mail_outbox.dedupe_key, data.dedupeKey))
      .limit(1);
    mailOutboxToken = existing[0]?.token;
  }
  if (mailOutboxToken === undefined) {
    throw new Error('Failed to insert mail outbox row');
  }
  return mailOutboxToken;
}

/** Loads one outbox row by its token, or `null` when the row is gone (retention, a restore). */
export async function findMailOutboxByToken(mailOutboxToken: string) {
  const rows = await mailOutboxDatabase()
    .select()
    .from(mail_outbox)
    .where(eq(mail_outbox.resend_idempotency_token, mailOutboxToken))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Atomically claims a pending outbox row for delivery (`pending` → `sending`).
 */
export async function tryClaimPendingMailOutbox(
  mailOutboxToken: string,
): Promise<MailOutboxClaimResult> {
  const claimedRows = await mailOutboxDatabase()
    .update(mail_outbox)
    .set({ status: 'sending', updated_at: new Date() })
    .where(
      and(
        eq(mail_outbox.resend_idempotency_token, mailOutboxToken),
        eq(mail_outbox.status, 'pending'),
      ),
    )
    .returning({ id: mail_outbox.id });

  if (claimedRows.length > 0) {
    return 'claimed';
  }

  const existingRow = await findMailOutboxByToken(mailOutboxToken);
  if (!existingRow) {
    return 'not_found';
  }
  if (existingRow.status === 'sent') {
    return 'already_sent';
  }
  if (existingRow.status === 'failed') {
    // Terminal state (audit-#W1): the body was scrubbed on failure, so this row can never be
    // re-sent. Distinct from `in_flight` so the DLQ replay tool reports it honestly instead of
    // claiming success on a silent no-op.
    return 'failed';
  }
  return 'in_flight';
}

/** Moves stuck `sending` rows back to `pending` for the outbox sweeper; returns their tokens. */
export async function reclaimStaleSendingMailOutboxTokens(
  stuckSendingBefore: Date,
  limit: number,
): Promise<string[]> {
  const staleRows = await mailOutboxDatabase()
    .select({ id: mail_outbox.id })
    .from(mail_outbox)
    .where(and(eq(mail_outbox.status, 'sending'), lt(mail_outbox.updated_at, stuckSendingBefore)))
    .orderBy(asc(mail_outbox.updated_at))
    .limit(limit);

  if (staleRows.length === 0) {
    return [];
  }

  const staleIds = staleRows.map((row) => row.id);
  const reclaimedRows = await mailOutboxDatabase()
    .update(mail_outbox)
    .set({ status: 'pending', updated_at: new Date() })
    .where(
      and(
        eq(mail_outbox.status, 'sending'),
        inArray(mail_outbox.id, staleIds),
        lt(mail_outbox.updated_at, stuckSendingBefore),
      ),
    )
    .returning({ token: mail_outbox.resend_idempotency_token });

  return reclaimedRows.map((row) => row.token);
}

/** Tokens of pending rows older than the cutoff (for the outbox sweeper repeatable job). */
export async function findStalePendingMailOutboxTokens(
  pendingOlderThan: Date,
  limit: number,
): Promise<string[]> {
  const rows = await mailOutboxDatabase()
    .select({ token: mail_outbox.resend_idempotency_token })
    .from(mail_outbox)
    .where(and(eq(mail_outbox.status, 'pending'), lt(mail_outbox.created_at, pendingOlderThan)))
    .orderBy(asc(mail_outbox.created_at))
    .limit(limit);
  return rows.map((row) => row.token);
}

/**
 * Finalises a row as `sent`, stamping the Resend message id and `sent_at` —
 * called after a successful Resend `emails.send` in {@link processMailOutboxJob}.
 */
export async function markMailOutboxSent(
  mailOutboxToken: string,
  resendMessageId: string,
): Promise<void> {
  await mailOutboxDatabase()
    .update(mail_outbox)
    .set({
      status: 'sent',
      resend_message_id: resendMessageId,
      sent_at: new Date(),
      updated_at: new Date(),
      // sec-r5-crypto-1: scrub the rendered email body after a successful
      // send. Email-code / invitation / password-reset / email-verification
      // templates embed the live single-use token directly in the HTML; if
      // the row persists post-send (which it does — there is no retention
      // sweep), a future PITR snapshot consumer, leaked operator console,
      // SQLi, or compromised clinozy_be_app credential could replay the token
      // even though `auth.verification_tokens` itself stores only hashes.
      // Resend returns a message id once we know delivery succeeded; we no
      // longer need the body. The row is retained for the audit trail
      // (recipient, subject, message id, sent_at).
      html: '',
      text_body: null,
    })
    .where(eq(mail_outbox.resend_idempotency_token, mailOutboxToken));
}

/**
 * Marks the row `failed` — terminal: BullMQ exhausted its attempts, Resend refused the email, or
 * the row itself is unusable. The DLQ hook captures the final-failure event for operator follow-up.
 */
export async function markMailOutboxFailed(mailOutboxToken: string): Promise<void> {
  await mailOutboxDatabase()
    .update(mail_outbox)
    .set({
      status: 'failed',
      updated_at: new Date(),
      // audit-#10: scrub the secret-bearing rendered body on TERMINAL failure too — not only on
      // success. A `failed` row still embedded the live single-use token (password-reset /
      // email-code / invitation / email-verification); previously only `markMailOutboxSent`
      // cleared it, so a permanently-failed delivery left the token recoverable from a PITR
      // snapshot, leaked operator console, SQLi, or compromised app credential until token
      // expiry (and invitation/verification tokens can be long-lived). The row is retained for
      // the audit trail (recipient, subject, status, timestamps); a manual resend must mint a
      // fresh token rather than replaying stored HTML.
      html: '',
      text_body: null,
    })
    .where(eq(mail_outbox.resend_idempotency_token, mailOutboxToken));
}

/** Reverts a claimed row to `pending` so BullMQ retries can call Resend again. */
export async function releaseMailOutboxClaim(mailOutboxToken: string): Promise<void> {
  await mailOutboxDatabase()
    .update(mail_outbox)
    .set({ status: 'pending', updated_at: new Date() })
    .where(
      and(
        eq(mail_outbox.resend_idempotency_token, mailOutboxToken),
        eq(mail_outbox.status, 'sending'),
      ),
    );
}

/** Pending-row gauge for health/observability endpoints and the outbox sweeper. */
export async function countPendingMailOutbox(): Promise<number> {
  const rows = await mailOutboxDatabase()
    .select({ count: count() })
    .from(mail_outbox)
    .where(eq(mail_outbox.status, 'pending'));
  return rows[0]?.count ?? 0;
}
