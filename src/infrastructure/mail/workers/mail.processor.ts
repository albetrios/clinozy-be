import { z } from 'zod';
import { UnrecoverableError } from 'bullmq';
import { CircuitBreakerOpenError } from '@/infrastructure/resilience/circuit-breaker.js';
import { sendEmail } from '@/infrastructure/mail/mail.service.js';
import { ResendApiError } from '@/infrastructure/mail/resend-api.error.js';
import { MAIL_QUEUE_MAX_ATTEMPTS } from '@/infrastructure/mail/queues/mail.queue.js';
import {
  findMailOutboxById,
  markMailOutboxFailed,
  markMailOutboxSent,
  releaseMailOutboxClaim,
  tryClaimPendingMailOutbox,
} from '@/infrastructure/mail/mail-outbox.repository.js';
import { MAIL_QUEUE_NAME, type MailJobData } from '@/infrastructure/mail/queues/mail.queue.js';
import { mailJobDataSchema } from '@/infrastructure/mail/queues/mail.job.schema.js';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
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
 * Result of {@link processMailOutboxJob}: Resend message id on success, or
 * `skipped: true` when the row was already `sent` / in flight from a sibling
 * worker.
 *
 * @remarks
 * - **Algorithm:** `skipped` is set whenever the claim transition returned
 *   `already_sent` or `in_flight`; `messageId` is the Resend id either from the
 *   fresh send or the prior `sent` row.
 * - **Failure modes:** never returned on hard error — those throw to BullMQ.
 * - **Side effects:** none from the type itself.
 * - **Notes:** consumed by tests and observability assertions.
 */
export type ProcessMailOutboxJobResult = {
  messageId?: string;
  skipped?: boolean;
};

/**
 * Processes one `mail/send-email` job: claims the outbox row, calls Resend via
 * {@link sendEmail}, and finalises status.
 *
 * @remarks
 * - **Algorithm:** atomic `pending → sending` claim, send through Resend, then
 *   `markMailOutboxSent` on success. On error, releases the claim back to
 *   `pending` for retry — except on the final attempt where the row is marked
 *   `failed` so the DLQ hook fires.
 * - **Failure modes:** missing outbox row throws (unrecoverable); already-sent /
 *   in-flight short-circuit to a `skipped` result; `CircuitBreakerOpenError` is
 *   never terminal — the claim is released so BullMQ can retry past cooldown; a
 *   Resend per-email rejection (bad recipient, field or attachment) marks the row
 *   failed at once and throws unrecoverable — no retry can deliver that email.
 * - **Side effects:** updates `auth.mail_outbox.status` / `sent_at` /
 *   `resend_message_id`; sends one HTTP request to Resend per claimed attempt;
 *   emits `mail.worker.*` structured logs.
 * - **Notes:** idempotent — duplicate jobs for the same `mailOutboxId` resolve
 *   to `skipped` once status is `sent`. Runs inside a `system_table` worker
 *   context (no tenant RLS) because `auth.mail_outbox` is not tenant-scoped.
 */
export async function processMailOutboxJob(
  jobData: MailJobData,
  options: ProcessMailOutboxJobOptions = {},
): Promise<ProcessMailOutboxJobResult> {
  return withMaintenanceDatabaseContext(MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER, () =>
    processMailOutboxJobInner(jobData, options),
  );
}

async function processMailOutboxJobInner(
  jobData: MailJobData,
  options: ProcessMailOutboxJobOptions = {},
): Promise<ProcessMailOutboxJobResult> {
  const { mailOutboxId, requestId } = parseBullMQJobData(
    mailJobDataSchema,
    jobData,
    MAIL_QUEUE_NAME,
  );
  const maxJobAttempts = options.maxJobAttempts ?? DEFAULT_MAIL_JOB_MAX_ATTEMPTS;
  const jobAttemptNumber = options.jobAttemptNumber ?? 0;
  const isFinalJobAttempt = jobAttemptNumber + 1 >= maxJobAttempts;

  const outboxRow = await findMailOutboxById(mailOutboxId);
  if (!outboxRow) {
    // audit-#M2: a missing row is a PHANTOM — the request that scheduled this job rolled back (or a
    // slow request had its durable task swept before commit), so the row never persisted. Retrying
    // cannot make it appear; throwing UnrecoverableError skips BullMQ's retry budget and the
    // resulting false final-failure DLQ alert. A committed row is never missing here.
    throw new UnrecoverableError(`mail.outbox.not_found:${String(mailOutboxId)}`);
  }

  const claimResult = await tryClaimPendingMailOutbox(mailOutboxId);
  if (claimResult === 'already_sent') {
    logger.info(
      {
        jobId: options.jobId,
        requestId,
        mailOutboxId,
        resendMessageId: outboxRow.resend_message_id,
      },
      'mail.worker.already_sent',
    );
    return omitUndefined({
      messageId: outboxRow.resend_message_id ?? undefined,
      skipped: true as const,
    });
  }
  if (claimResult === 'in_flight') {
    logger.info({ jobId: options.jobId, requestId, mailOutboxId }, 'mail.worker.in_flight');
    return omitUndefined({ skipped: true as const });
  }
  if (claimResult === 'failed') {
    // audit-#W1: terminal `failed` row — the body was scrubbed on failure, so it can NEVER be
    // re-sent. Previously this fell through to `in_flight` and returned `skipped: true`, so a DLQ
    // replay looked like a success while silently delivering nothing. Throw UnrecoverableError so a
    // replayed job fails fast (no retry burn) and reappears in the DLQ with this explicit reason.
    logger.warn(
      { jobId: options.jobId, requestId, mailOutboxId },
      'mail.worker.terminal_failed_not_replayable',
    );
    throw new UnrecoverableError(
      `mail.outbox.terminal_failed_not_replayable:${String(mailOutboxId)}`,
    );
  }
  if (claimResult !== 'claimed') {
    throw new Error(`mail.outbox.not_claimable:${String(mailOutboxId)}:${claimResult}`);
  }

  // sec-new-Q3: parse the JSONB column instead of blindly casting so a
  // corrupt or mis-shaped row throws early (and retries) rather than
  // reaching sendEmail() with a non-array / non-string value.
  const toAddresses = z.array(z.email()).parse(outboxRow.to_addresses);
  logger.info(
    {
      jobId: options.jobId,
      requestId,
      mailOutboxId,
      recipientCount: toAddresses.length,
      jobAttemptNumber,
      maxJobAttempts,
    },
    'mail.worker.processing',
  );

  try {
    const messageId = await sendEmail(
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

    await markMailOutboxSent(mailOutboxId, messageId);
    logger.info(
      {
        jobId: options.jobId,
        requestId,
        mailOutboxId,
        resendMessageId: messageId,
      },
      'email.sent',
    );
    return { messageId };
  } catch (error) {
    throw await settleFailedSend({
      error,
      mailOutboxId,
      jobId: options.jobId,
      requestId,
      jobAttemptNumber,
      maxJobAttempts,
      isFinalJobAttempt,
    });
  }
}

/**
 * Settles the outbox row after a failed send and returns the error the job should throw: a
 * per-email rejection fails the row for good (`UnrecoverableError`, no retries), an open circuit
 * releases the claim, and any other error releases it too — or fails the row on the last attempt.
 */
async function settleFailedSend(options: {
  error: unknown;
  mailOutboxId: number;
  jobId: string | undefined;
  requestId: string | undefined;
  jobAttemptNumber: number;
  maxJobAttempts: number;
  isFinalJobAttempt: boolean;
}): Promise<Error> {
  const { error, mailOutboxId, jobId, requestId, jobAttemptNumber, maxJobAttempts } = options;

  if (error instanceof ResendApiError && error.isPerEmailRejection) {
    // Resend refused this email for something about the email itself (a bad recipient, field or
    // attachment): sending it again cannot succeed, so fail the row for good instead of burning
    // the BullMQ retries — UnrecoverableError skips the retry budget.
    await markMailOutboxFailed(mailOutboxId);
    logger.warn(
      {
        jobId,
        requestId,
        mailOutboxId,
        statusCode: error.statusCode,
        resendErrorName: error.resendErrorName,
      },
      'mail.worker.rejected',
    );
    return new UnrecoverableError(`mail.send.rejected:${String(mailOutboxId)}: ${error.message}`);
  }

  const isCircuitOpen = error instanceof CircuitBreakerOpenError;
  if (options.isFinalJobAttempt && !isCircuitOpen) {
    await markMailOutboxFailed(mailOutboxId);
  } else {
    await releaseMailOutboxClaim(mailOutboxId);
  }
  if (isCircuitOpen) {
    logger.warn(
      {
        jobId,
        requestId,
        mailOutboxId,
        circuit: error.circuitName,
        retryAfterMs: error.retryAfterMs,
        jobAttemptNumber,
        maxJobAttempts,
      },
      'mail.worker.circuit_open',
    );
  }
  return error instanceof Error
    ? error
    : new Error(`mail.send.failed:outbox:${String(mailOutboxId)}`);
}
