import { Queue } from 'bullmq';
import {
  getBullMQKeyPrefix,
  getBullMQProducerConnectionOptions,
} from '@/infrastructure/queue/connection.js';
import {
  DEFAULT_JOB_RETENTION_COUNT,
  QUEUE_RETRY_JITTER_RATIO,
} from '@/infrastructure/queue/queue.constants.js';
import { captureTraceContextForPropagation } from '@/infrastructure/observability/tracing/trace-context.util.js';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { FIVE_SECONDS_MS, SEVEN_DAYS_SECONDS } from '@/shared/constants/ttl.constants.js';
import {
  notificationJobDataSchema,
  type NotificationJobDataValidated,
} from './notification.job.schema.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { createWorkerNotificationRepository } from '@/domains/notify/sub-domains/notification/notification.repository.js';
import { invalidateCachedUnreadNotificationCount } from '@/domains/notify/sub-domains/notification/notification-unread-count.cache.js';

/** BullMQ queue name for asynchronous notification dispatch (in-app + email fan-out). */
export const NOTIFICATION_QUEUE_NAME = 'notification';

/** Only public ids are stored in Redis; content is loaded in the worker from Postgres, scoped by them. */
export type NotificationJobData = NotificationJobDataValidated;

let notificationQueue: Queue<NotificationJobData> | null = null;

/**
 * The process-wide `notification` producer (lazily created) — its default job options (three
 * attempts, exponential backoff, bounded retention) apply to every job added through it,
 * including dead-letter replays.
 */
export function getNotificationQueue(): Queue<NotificationJobData> {
  if (notificationQueue) return notificationQueue;
  notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
    connection: getBullMQProducerConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
    defaultJobOptions: {
      removeOnComplete: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      removeOnFail: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      attempts: 3,
      backoff: { type: 'exponential', delay: FIVE_SECONDS_MS, jitter: QUEUE_RETRY_JITTER_RATIO },
    },
  });
  return notificationQueue;
}

/**
 * Enqueue a notification for async delivery across configured channels.
 */
export async function enqueueNotification(options: {
  notificationPublicId: string;
  organizationPublicId: string | null;
  userPublicId: string;
  requestId?: string;
}): Promise<void> {
  const { notificationPublicId, organizationPublicId, userPublicId, requestId } = options;
  const queue = getNotificationQueue();
  const jobData = parseBullMQJobData(
    notificationJobDataSchema,
    omitUndefined({
      notificationPublicId,
      organizationPublicId,
      userPublicId,
      requestId,
      ...captureTraceContextForPropagation(),
    }),
    NOTIFICATION_QUEUE_NAME,
  );
  // audit #6: deduplicate per notification. A recovery/redelivery path (post-commit dispatch
  // recovery, an event handler firing twice, or a producer-side retry) that re-enqueues the same
  // persisted notification must not produce a second dispatch — and therefore a second outbound
  // email — for one in-app notification row. BullMQ drops an add whose jobId still exists in any
  // bucket (retained for SEVEN_DAYS_SECONDS), so a re-enqueue inside that window is a no-op. The
  // job id is the notification's public id as-is (the queue name is already in every key), never
  // the bigserial: that restarts at 1 after TRUNCATE ... RESTART IDENTITY or a restore while Redis
  // keeps finished jobs, and the add for a new notification reusing the id would be dropped.
  await queue.add('dispatch-notification', jobData, { jobId: notificationPublicId });
}

/**
 * Deletes a notification row whose delivery job never reached the queue, and drops the recipient's
 * cached unread count — the post-commit dispatch's clean-up when Redis refuses the add.
 *
 * @remarks
 * - **Algorithm:** delete by public id under the recipient's own scope (`notifications_owner_delete`
 *   reaches the row with or without an organization), then invalidate the cached count a read in
 *   between may have taken.
 * - **Failure modes:** a database error propagates to the dispatch, which retries the task.
 * - **Side effects:** one deleted `notify.notifications` row; one cache tombstone.
 * - **Notes:** a notification is not recovered by a sweep — it is dropped by design
 *   (`workers-and-events.md`, "When Redis refuses the enqueue"). Owned here so infrastructure never
 *   reaches into this domain's repository.
 */
export async function discardUndispatchedNotification(notification: {
  notificationPublicId: string;
  userPublicId: string;
}): Promise<void> {
  await withAppDatabaseContext(
    PRINCIPAL_SCOPE.VERIFIED({ userPublicId: notification.userPublicId }),
    (databaseHandle) =>
      createWorkerNotificationRepository(databaseHandle).deleteByPublicId(
        notification.notificationPublicId,
      ),
  );
  await invalidateCachedUnreadNotificationCount(notification.userPublicId);
}

/** Close the lazily-initialised notification queue (graceful-shutdown hook for tests/runtime). */
export async function closeNotificationQueue(): Promise<void> {
  if (notificationQueue) {
    await notificationQueue.close();
    notificationQueue = null;
  }
}

/**
 * Verifies BullMQ can reach Redis through the Queue API used by producers.
 */
export async function pingNotificationQueueConnection(): Promise<void> {
  const queue = getNotificationQueue();
  await queue.waitUntilReady();
  await queue.getJobCounts('waiting');
}
