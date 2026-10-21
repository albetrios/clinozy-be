import { z } from 'zod';
import { UnrecoverableError } from 'bullmq';
import { sendEmail } from '@/infrastructure/mail/mail.service.js';
import { ResendApiError } from '@/infrastructure/mail/resend-api.error.js';
import { MAIL_QUEUE_MAX_ATTEMPTS } from '@/infrastructure/mail/queues/mail.queue.js';
import {
  findMailOutboxByToken,
  markMailOutboxFailed,
  markMailOutboxSent,
  releaseMailOutboxClaim,
  tryClaimPendingMailOutbox,
  type MailOutboxClaimResult,
} from '@/infrastructure/mail/mail-outbox.repository.js';
import { MAIL_QUEUE_NAME, type MailJobData } from '@/infrastructure/mail/queues/mail.queue.js';
import { mailJobDataSchema } from '@/infrastructure/mail/queues/mail.job.schema.js';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import {
  ProviderOutageError,
  toProviderOutageError,
} from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { isReservedEmailDomain } from '@/shared/utils/text/email.util.js';
import { env } from '@/shared/config/env.config.js';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';

const DEFAULT_MAIL_JOB_MAX_ATTEMPTS = MAIL_QUEUE_MAX_ATTEMPTS;

/**
 * Builds the Resend idempotency key for a mail_outbox row from the row's stored random token.
 *
 * @remarks
 * - **Algorithm:** `mail-outbox-<resend_idempotency_token>` — a uuid Postgres generates on
 *   insert, so the key is unique across every database sending through the same Resend account.
 *   The bigserial `id` is not: it restarts at 1 after `TRUNCATE ... RESTART IDENTITY` or on a
 *   fresh database, and Resend rejects a key reused with a different body for 24 hours
 *   (409 `invalid_idempotent_request`), so that email would never be delivered.
 * - **Failure modes:** none — pure string builder.
 * - **Side effects:** none.
 * - **Notes:** the key is row-scoped (not attempt-scoped) on purpose: read from the row, it is the
 *   same on every BullMQ retry and sweeper reclaim, so a worker that sent then crashed before
 *   marking `sent` re-uses it and Resend collapses the duplicate `emails.send` into one delivery
 *   (audit #20).
 */
export function buildMailOutboxIdempotencyKey(resendIdempotencyToken: string): string {
  return `mail-outbox-${resendIdempotencyToken}`;
}

/**
 * Options forwarded from the BullMQ wrapper to {@link processMailOutboxJob} —
 * job identity, propagated request id, and the attempt counters used to detect
 * the final retry for terminal `failed` state.
 *
 * @remarks
 * - **Algorithm:** `jobAttemptNumber + 1 >= maxJobAttempts` flips the processor
 *   into "final attempt" behaviour (`markMailOutboxFailed` instead of release).
 * - **Failure modes:** undefined attempt fields default to `0` / `MAIL_QUEUE_MAX_ATTEMPTS`
 *   — pass the real BullMQ `attemptsMade` and `job.opts.attempts` from the worker.
 * - **Side effects:** none — pure data carrier.
 * - **Notes:** `requestId` is also re-parsed from the job payload so tests can
 *   omit options entirely.
 */
export type ProcessMailOutboxJobOptions = {
  jobId?: string;
  requestId?: string;
  /** Zero-based BullMQ attemptsMade for the current run. */
  jobAttemptNumber?: number;
  /** Configured BullMQ attempts (from queue defaultJobOptions). */
  maxJobAttempts?: number;
};

/**
 * What one `mail/send-email` job did.
 *
 * @remarks
 * - **Algorithm:** `sent` carries the Resend message id. `skipped` covers the jobs with nothing to
 *   do: the row is already `sent` (its message id is returned), another execution holds it
 *   (`in_flight` — the outbox sweeper re-enqueues it if that execution died), or the row is gone
 *   (`not_found` — pruned, erased, or lost to a restore; nothing can bring it back), or every
 *   recipient is on a reserved domain (`reserved_domain` — only with
 *   `MAIL_RESERVED_DOMAIN_SKIP_ENABLED`, local and development; the row is `failed`, Resend is never
 *   called). `rejected` is Resend refusing this one email (a bad recipient, field or attachment):
 *   the row is `failed`.
 * - **Failure modes:** never returned on a retryable or alerting error — those throw to BullMQ.
 * - **Side effects:** none from the type itself.
 * - **Notes:** every variant completes the job; it is the job's return value in Bull Board.
 */
export type ProcessMailOutboxJobResult =
  | { outcome: 'sent'; messageId: string }
  | {
      outcome: 'skipped';
      reason: 'already_sent' | 'in_flight' | 'not_found' | 'reserved_domain';
      messageId?: string;
    }
  | { outcome: 'rejected'; statusCode: number | null };

/**
 * Processes one `mail/send-email` job: loads the outbox row by its token, claims it, calls Resend
 * via {@link sendEmail}, and finalises status.
 *
 * @remarks
 * - **Algorithm:** atomic `pending → sending` claim, parse the recipients, send through Resend,
 *   then `markMailOutboxSent` on success. On error, releases the claim back to `pending` for
 *   retry — except on the final attempt where the row is marked `failed` so the DLQ hook fires.
 * - **Failure modes:** a missing row, a row already sent and a row another execution holds
 *   complete as `skipped`; a terminal `failed` row (body scrubbed) throws `UnrecoverableError`;
 *   recipients that do not parse fail the row and throw `UnrecoverableError` — the row is broken
 *   and no retry fixes it (it used to stay `sending` and loop through the sweeper forever);
 *   a Resend outage (`ProviderOutageError` — the circuit is open, or this failure left it open or
 *   half-open) is never terminal, even on the last attempt: the claim is released and the worker
 *   pauses the queue until Resend is back; so is a Resend throttle (429 `rate_limit_exceeded`),
 *   which pauses it for Resend's `Retry-After`; a Resend per-email rejection fails the row and
 *   completes as `rejected`. With `MAIL_RESERVED_DOMAIN_SKIP_ENABLED` (local and development only)
 *   recipients on a reserved domain are dropped before the send, and a row left with none is
 *   failed and completes as `skipped` (`reserved_domain`) without calling Resend.
 * - **Side effects:** updates `auth.mail_outbox.status` / `sent_at` /
 *   `resend_message_id`; sends one HTTP request to Resend per claimed attempt;
 *   emits `mail.worker.*` structured logs.
 * - **Notes:** idempotent — duplicate jobs for the same row resolve to `skipped` once status is
 *   `sent`. Runs inside a `system_table` worker context (no tenant RLS) because
 *   `auth.mail_outbox` is not tenant-scoped.
 */
export async function processMailOutboxJob({
  jobData,
  options = {},
}: {
  jobData: MailJobData;
  options?: ProcessMailOutboxJobOptions | undefined;
}): Promise<ProcessMailOutboxJobResult> {
  return withMaintenanceDatabaseContext({
    scope: MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER,
    callback: () => processMailOutboxJobInner({ jobData, options }),
  });
}

/** Claim outcomes that end the job before any send — or `null` when this execution owns the row. */
function settleUnclaimedRow(options: {
  claimResult: Exclude<MailOutboxClaimResult, 'claimed'>;
  mailOutboxToken: string;
  resendMessageId: string | null;
  logFields: Record<string, unknown>;
}): ProcessMailOutboxJobResult {
  const { claimResult, mailOutboxToken, logFields } = options;
  switch (claimResult) {
    case 'already_sent':
      logger.info(
        { ...logFields, resendMessageId: options.resendMessageId },
        'mail.worker.already_sent',
      );
      return omitUndefined({
        outcome: 'skipped' as const,
        reason: 'already_sent' as const,
        messageId: options.resendMessageId ?? undefined,
      });
    case 'in_flight':
      logger.info(logFields, 'mail.worker.in_flight');
      return { outcome: 'skipped', reason: 'in_flight' };
    case 'not_found':
      logger.warn(logFields, 'mail.worker.not_found');
      return { outcome: 'skipped', reason: 'not_found' };
    case 'failed':
      // audit-#W1: terminal `failed` row — the body was scrubbed on failure, so it can NEVER be
      // re-sent. Reporting `skipped` made a DLQ replay look like a success while delivering
      // nothing; fail the replayed job fast (no retry burn) with this explicit reason instead.
      logger.warn(logFields, 'mail.worker.terminal_failed_not_replayable');
      throw new UnrecoverableError(`mail.outbox.terminal_failed_not_replayable:${mailOutboxToken}`);
  }
}

async function processMailOutboxJobInner({
  jobData,
  options = {},
}: {
  jobData: MailJobData;
  options?: ProcessMailOutboxJobOptions | undefined;
}): Promise<ProcessMailOutboxJobResult> {
  const { mailOutboxToken, requestId } = parseBullMQJobData({
    schema: mailJobDataSchema,
    data: jobData,
    queueName: MAIL_QUEUE_NAME,
  });
  const maxJobAttempts = options.maxJobAttempts ?? DEFAULT_MAIL_JOB_MAX_ATTEMPTS;
  const jobAttemptNumber = options.jobAttemptNumber ?? 0;
  const isFinalJobAttempt = jobAttemptNumber + 1 >= maxJobAttempts;
  const logFields = { jobId: options.jobId, requestId, mailOutboxToken };

  const outboxRow = await findMailOutboxByToken(mailOutboxToken);
  if (!outboxRow) {
    // audit-#M2: a missing row is a PHANTOM — the request that scheduled this job rolled back, the
    // row was pruned or erased, or a restore lost it. Retrying cannot make it appear, and there is
    // nothing for anyone to act on: complete the job.
    return settleUnclaimedRow({
      claimResult: 'not_found',
      mailOutboxToken,
      resendMessageId: null,
      logFields,
    });
  }

  const claimResult = await tryClaimPendingMailOutbox(mailOutboxToken);
  if (claimResult !== 'claimed') {
    return settleUnclaimedRow({
      claimResult,
      mailOutboxToken,
      resendMessageId: outboxRow.resend_message_id,
      logFields,
    });
  }

  // sec-new-Q3: parse the JSONB column instead of blindly casting. A row that does not parse is
  // broken for good: fail it (scrubbing its body) and stop — leaving it `sending` made every
  // execution after this one skip it as in flight until the sweeper reclaimed it, forever.
  const parsedRecipients = z.array(z.email()).min(1).safeParse(outboxRow.to_addresses);
  if (!parsedRecipients.success) {
    await markMailOutboxFailed(mailOutboxToken);
    logger.error(logFields, 'mail.worker.recipients_invalid');
    throw new UnrecoverableError(`mail.outbox.recipients_invalid:${mailOutboxToken}`);
  }
  // Local and development only (the env schema refuses the flag elsewhere): a reserved domain
  // (example.com, *.test, …) never receives mail and Resend refuses the whole email with a 422, so
  // drop those recipients — every seeded and test account uses one — and with none left, fail the
  // row without calling Resend.
  const toAddresses = env.MAIL_RESERVED_DOMAIN_SKIP_ENABLED
    ? parsedRecipients.data.filter((address) => !isReservedEmailDomain(address))
    : parsedRecipients.data;
  if (toAddresses.length === 0) {
    await markMailOutboxFailed(mailOutboxToken);
    logger.info(
      { ...logFields, recipientCount: parsedRecipients.data.length },
      'mail.worker.reserved_domain_skipped',
    );
    return { outcome: 'skipped', reason: 'reserved_domain' };
  }
  logger.info(
    { ...logFields, recipientCount: toAddresses.length, jobAttemptNumber, maxJobAttempts },
    'mail.worker.processing',
  );

  let messageId: string;
  try {
    messageId = await sendEmail(
      omitUndefined({
        to: toAddresses,
        subject: outboxRow.subject,
        html: outboxRow.html,
        text: outboxRow.text_body ?? undefined,
        replyTo: outboxRow.reply_to ?? undefined,
        tags: (outboxRow.tags as { name: string; value: string }[] | null) ?? undefined,
        idempotencyKey: buildMailOutboxIdempotencyKey(outboxRow.resend_idempotency_token),
        requestId,
      }),
    );
  } catch (error) {
    return settleFailedSend({
      error,
      mailOutboxToken,
      logFields,
      jobAttemptNumber,
      maxJobAttempts,
      isFinalJobAttempt,
    });
  }

  await markMailOutboxSent(mailOutboxToken, messageId);
  logger.info({ ...logFields, resendMessageId: messageId }, 'email.sent');
  return { outcome: 'sent', messageId };
}

/**
 * Settles the outbox row after a failed send. A per-email rejection fails the row for good and
 * completes the job as `rejected` (the recipient's problem, not ours — no retry, no page). A Resend
 * throttle or outage releases the claim and throws {@link ProviderOutageError}, whatever the
 * attempt: the row waits for Resend, it is never failed for it. Any other error releases the claim
 * too — or fails the row on the last attempt — and is rethrown so BullMQ retries or dead-letters
 * the job.
 */
async function settleFailedSend(options: {
  error: unknown;
  mailOutboxToken: string;
  logFields: Record<string, unknown>;
  jobAttemptNumber: number;
  maxJobAttempts: number;
  isFinalJobAttempt: boolean;
}): Promise<ProcessMailOutboxJobResult> {
  const { error, mailOutboxToken, logFields, jobAttemptNumber, maxJobAttempts } = options;

  if (error instanceof ResendApiError && error.isPerEmailRejection) {
    // Resend refused this email for something about the email itself (a bad recipient, field or
    // attachment): sending it again cannot succeed, so fail the row for good and complete.
    await markMailOutboxFailed(mailOutboxToken);
    logger.warn(
      { ...logFields, statusCode: error.statusCode, resendErrorName: error.resendErrorName },
      'mail.worker.rejected',
    );
    return { outcome: 'rejected', statusCode: error.statusCode };
  }

  const outage =
    error instanceof ResendApiError && error.isRateLimited
      ? new ProviderOutageError({
          provider: 'resend',
          cause: error,
          retryAfterMs: error.retryAfterMs,
        })
      : await toProviderOutageError({ error, provider: 'resend' });
  if (outage) {
    await releaseMailOutboxClaim(mailOutboxToken);
    const outageLogFields = { ...logFields, jobAttemptNumber, maxJobAttempts };
    if (outage.retryAfterMs === null) {
      logger.warn(outageLogFields, 'mail.worker.provider_outage');
    } else {
      logger.info(
        { ...outageLogFields, retryAfterMs: outage.retryAfterMs },
        'mail.worker.throttled',
      );
    }
    throw outage;
  }
  if (options.isFinalJobAttempt) {
    await markMailOutboxFailed(mailOutboxToken);
  } else {
    await releaseMailOutboxClaim(mailOutboxToken);
  }
  throw error instanceof Error ? error : new Error(`mail.send.failed:outbox:${mailOutboxToken}`);
}
