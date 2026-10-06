import { Worker } from 'bullmq';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { getDefaultWorkerOptions } from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import { parseJobDataOrDeadLetter } from '@/infrastructure/queue/dlq/poison-job.util.js';
import { runWithPropagatedTraceContext } from '@/infrastructure/observability/tracing/trace-context.util.js';
import { notificationJobDataSchema } from '@/domains/notify/sub-domains/notification/queues/notification.job.schema.js';
import {
  NOTIFICATION_QUEUE_NAME,
  type NotificationJobData,
} from '@/domains/notify/sub-domains/notification/queues/notification.queue.js';
import {
  type NotificationRepository,
  createWorkerNotificationRepository,
} from '@/domains/notify/sub-domains/notification/notification.repository.js';
import { dispatchOutboxEmail, recordOutboxEmail } from '@/infrastructure/mail/queues/mail.queue.js';
import { isMailConfigured } from '@/infrastructure/mail/mail.service.js';
import { buildNotificationEmailHtml } from './notification-email-content.js';
import {
  isNotificationEmailDispatched,
  markNotificationEmailDispatched,
} from './notification-email-idempotency.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { getWorkerConcurrencyNotify } from '@/shared/config/worker-concurrency.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import {
  runOrganizationScopedWorkerJob,
  runUserScopedWorkerJob,
  type WorkerDatabaseHandle,
} from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
type NotificationDispatchData = {
  channels?: ('email' | 'in_app')[];
  email?: string;
};

/**
 * Dispatch the email channel for one notification. Handles the two-phase outbox (Postgres
 * INSERT then BullMQ enqueue) under a per-notification claim so retries collapse without
 * producing duplicate sends.
 *
 * @remarks
 * - **Algorithm:** claim → record outbox row → dispatch outbox enqueue. The claim is keyed by
 *   `(notification public id, recipient)` with a TTL. If the INSERT fails, the claim is released so
 *   a BullMQ retry can try again. If the INSERT succeeds but the BullMQ enqueue fails, the
 *   claim is KEPT and the failure is logged — the mail-outbox sweeper will re-enqueue the
 *   pending row, and any concurrent BullMQ retry of THIS job must hit `claimed = false` and
 *   skip, preventing a duplicate row + duplicate Resend send.
 * - **Failure modes:** propagates `recordOutboxEmail` errors so BullMQ retries; swallows
 *   `dispatchOutboxEmail` errors because the outbox row is the durability commit.
 * - **Side effects:** Redis claim write/release, Postgres outbox insert, BullMQ enqueue.
 */
async function dispatchNotificationEmail(options: {
  notificationPublicId: string;
  type: string;
  email: string | undefined;
  title: string;
  message: string;
  actionUrl: string | null | undefined;
  requestId: string | undefined;
}): Promise<string | null> {
  const { notificationPublicId, type, email, title, message, actionUrl, requestId } = options;
  if (!(isMailConfigured() && email)) {
    logger.warn({ channel: 'email', notificationPublicId }, 'notification.worker.channel_skipped');
    return null;
  }

  // audit-#7: durability-first dedup. Skip only when a prior run already PERSISTED
  // the mail-outbox row (durable marker set AFTER the insert). The previous
  // claim-before-insert model lost the email if the worker was hard-killed between
  // the claim and the insert: the fast BullMQ retry saw the claim, returned
  // `email:deduplicated` as success, and nothing ever sent.
  if (await isNotificationEmailDispatched({ notificationPublicId, recipient: email })) {
    logger.info({ notificationPublicId, type }, 'notification.worker.email_already_dispatched');
    return 'email:deduplicated';
  }

  const { subject, html } = buildNotificationEmailHtml({
    title,
    message,
    actionUrl: actionUrl ?? null,
  });

  // Persist the durable outbox row FIRST. If this throws, no marker was written, so
  // a BullMQ retry simply re-inserts — the email is never lost. reaudit-#4: pass a
  // dedupeKey so the insert is idempotent at the DB layer — two concurrent runs of the
  // same notification (stall → redelivery) converge on ONE outbox row (the second gets
  // back the existing row), closing the duplicate-email window the Redis marker alone left
  // open. The Redis marker below is now just a fast-path to skip the DB insert on retry. Keyed by
  // the notification's public id: a bigserial restarts after a restore and would collide.
  const mailOutboxToken = await withMaintenanceDatabaseContext(
    MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER,
    () =>
      recordOutboxEmail({
        to: email,
        subject,
        html,
        tags: [{ name: 'category', value: `notification-${type}` }],
        dedupeKey: `notification:${notificationPublicId}:email:${email.toLowerCase()}`,
      }),
  );

  // Fast-path marker so a plain BullMQ retry skips re-touching the row. Correctness no
  // longer depends on it (the DB dedupe_key is the authority); a crash before this mark
  // just means the retry re-runs the idempotent insert and resolves to the same row.
  await markNotificationEmailDispatched({ notificationPublicId, recipient: email });

  // Do NOT throw on dispatch failure — the mail-outbox sweeper re-enqueues the row.
  let dispatchSucceeded = false;
  try {
    // Notification email is fan-out: the bulk lane keeps sign-in codes and resets ahead of it.
    await dispatchOutboxEmail(mailOutboxToken, {
      lane: 'bulk',
      ...(requestId ? { requestId } : {}),
    });
    dispatchSucceeded = true;
  } catch (dispatchError) {
    logger.warn(
      { error: dispatchError, mailOutboxToken, notificationPublicId },
      'notification.worker.dispatch_failed_outbox_row_persisted',
    );
  }

  // audit #45: distinguish a durably-persisted-but-not-yet-dispatched outbox row
  // (the BullMQ enqueue failed; the mail-outbox sweeper will re-enqueue it, and
  // its depth is tracked by the `mail_outbox_pending` gauge) from a send that was
  // actually handed to the queue. The prior unconditional `email:queued` masked
  // the pending state as success, so a persistent enqueue failure looked healthy
  // in the per-channel outcome.
  return dispatchSucceeded ? 'email:queued' : 'email:outbox_pending';
}

/**
 * What one notification job did: dispatched across its channels, or skipped because the row is
 * gone.
 *
 * @remarks
 * `not_found` — the recipient deleted the notification, an erasure removed it, or a restore lost
 * it. Retrying cannot bring it back and nobody needs paging, so the job completes. Both variants
 * are the job's return value in Bull Board.
 */
export type NotificationDispatchJobResult =
  | { outcome: 'dispatched'; channels: string[] }
  | { outcome: 'skipped'; reason: 'not_found' };

/**
 * Hydrate a persisted notification and fan it out across its delivery channels (in-app, email).
 * Exported as a pure function so unit tests can drive it with an injected repository instead of
 * spinning up Redis/Postgres.
 *
 * @remarks
 * - **Algorithm:** load the row by its public id through `notificationRepository` — pinned by the
 *   caller to the notification's organization scope, or to its recipient's scope for a
 *   notification without one — then iterate `data.channels ?? ['in_app']`. The email channel
 *   renders the shared transactional template and persists/dispatches via the mail outbox under
 *   `withMaintenanceDatabaseContext(MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER)`, guarded by a
 *   one-time Redis dispatch marker so retries never enqueue a duplicate email.
 * - **Failure modes:** a missing row completes as `skipped` (`notification.worker.not_found`);
 *   absent mail configuration or recipient logs `notification.worker.channel_skipped` and
 *   continues; outbox write errors propagate so BullMQ can retry.
 * - **Side effects:** Postgres reads against `notify.notifications`; mail outbox insert and
 *   BullMQ enqueue on the email channel; structured logs throughout.
 * - **Notes:** the recipient's email is the joined `auth.users.email`, never anything in `data`.
 */
export async function processNotificationDispatchJob(options: {
  notificationPublicId: string;
  organizationPublicId: string | null;
  jobContext: { id?: string; requestId?: string };
  notificationRepository: NotificationRepository;
}): Promise<NotificationDispatchJobResult> {
  const { notificationPublicId, organizationPublicId, jobContext } = options;
  const notificationRow = await options.notificationRepository.findByPublicIdForDispatch(
    notificationPublicId,
    organizationPublicId,
  );

  if (!notificationRow) {
    logger.warn(
      { jobId: jobContext.id, requestId: jobContext.requestId, notificationPublicId },
      'notification.worker.not_found',
    );
    return { outcome: 'skipped', reason: 'not_found' };
  }

  const dispatchData = (notificationRow.data ?? {}) as NotificationDispatchData;
  const channels = dispatchData.channels ?? ['in_app'];
  // sec-N7: never let a producer-supplied `data.email` override the
  // authoritative recipient. `data` is `Record<string, unknown>`; the
  // moment any domain handler reflects request input into it, an attacker
  // could redirect system emails to a controlled inbox. Always use the
  // notification row's joined `auth.users.email`.
  const email = notificationRow.userEmail;
  const { type, title, message, actionUrl } = notificationRow;

  logger.info(
    {
      jobId: jobContext.id,
      requestId: jobContext.requestId,
      notificationPublicId,
      type,
      channels,
    },
    'notification.worker.processing',
  );

  const results: string[] = [];

  for (const channel of channels) {
    switch (channel) {
      case 'email': {
        const emailResult = await dispatchNotificationEmail({
          notificationPublicId,
          type,
          email,
          title,
          message,
          actionUrl,
          requestId: jobContext.requestId,
        });
        if (emailResult !== null) results.push(emailResult);
        break;
      }

      case 'in_app':
        results.push('in_app:persisted');
        break;
    }
  }

  return { outcome: 'dispatched', channels: results };
}

/**
 * Runs one notification job in the database scope its public ids name, then dispatches it.
 *
 * @remarks
 * - **Algorithm:** pin the scope from the job — the organization's
 *   (`runOrganizationScopedWorkerJob`) or, for a notification without one, the recipient's
 *   (`runUserScopedWorkerJob`, which the `notifications_owner_access` policy authorises) — and
 *   delegate to {@link processNotificationDispatchJob} with a repository on that handle.
 * - **Failure modes:** as {@link processNotificationDispatchJob}.
 * - **Side effects:** one scoped transaction for the read; the email channel's own writes.
 * - **Notes:** sec-D #10 — never the wide `app.global_retention_cleanup` scope, and no SECURITY
 *   DEFINER lookup: the recipient's public id travels in the job.
 */
export async function processNotificationJob(options: {
  jobData: Pick<
    NotificationJobData,
    'notificationPublicId' | 'organizationPublicId' | 'userPublicId' | 'requestId'
  >;
  jobId?: string;
}): Promise<NotificationDispatchJobResult> {
  const { notificationPublicId, organizationPublicId, userPublicId, requestId } = options.jobData;
  const dispatchInScope = (databaseHandle: WorkerDatabaseHandle) =>
    processNotificationDispatchJob({
      notificationPublicId,
      organizationPublicId,
      jobContext: omitUndefined({ id: options.jobId, requestId }),
      notificationRepository: createWorkerNotificationRepository(databaseHandle),
    });
  return organizationPublicId === null
    ? runUserScopedWorkerJob({ userPublicId }, dispatchInScope)
    : runOrganizationScopedWorkerJob({ organizationPublicId }, dispatchInScope);
}

/**
 * Creates a BullMQ worker that processes notification dispatch jobs.
 * Routes notifications to configured channels (email, in-app).
 *
 * @remarks
 * - **Algorithm:** parse the payload (a malformed one is dead-lettered at once), then run
 *   {@link processNotificationJob} inside the propagated trace context.
 * - **Failure modes:** BullMQ retries on thrown errors using the queue's exponential backoff
 *   (3 attempts); stalls and completions are logged via the worker listeners.
 * - **Side effects:** subscribes a `Worker` to {@link NOTIFICATION_QUEUE_NAME}; reads notification
 *   rows; writes to the mail outbox and enqueues mail jobs for the email channel.
 * - **Notes:** concurrency comes from `getWorkerConcurrencyNotify()`; default worker options
 *   provide stall + lock tuning. The returned handle wires graceful shutdown into bootstrap.
 */
export function createNotificationWorker(): WorkerHandle {
  const worker = new Worker<NotificationJobData>(
    NOTIFICATION_QUEUE_NAME,
    async (job) => {
      const jobData = await parseJobDataOrDeadLetter({
        schema: notificationJobDataSchema,
        job,
        queueName: NOTIFICATION_QUEUE_NAME,
      });
      return runWithPropagatedTraceContext(
        { traceparent: jobData.traceparent, tracestate: jobData.tracestate },
        job.name,
        () => processNotificationJob(omitUndefined({ jobData, jobId: job.id })),
      );
    },
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: getWorkerConcurrencyNotify(),
      ...getDefaultWorkerOptions(),
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, queue: NOTIFICATION_QUEUE_NAME }, 'notification.worker.stalled');
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job?.id }, 'notification.worker.completed');
  });

  return buildWorkerHandle(worker, NOTIFICATION_QUEUE_NAME);
}
