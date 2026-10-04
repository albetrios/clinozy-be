import { Queue } from 'bullmq';
import {
  getBullMQKeyPrefix,
  getBullMQProducerConnectionOptions,
} from '@/infrastructure/queue/connection.js';
import { DEFAULT_JOB_RETENTION_COUNT } from '@/infrastructure/queue/queue.constants.js';
import { captureTraceContextForPropagation } from '@/infrastructure/observability/tracing/trace-context.util.js';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { FIVE_SECONDS_MS, SEVEN_DAYS_SECONDS } from '@/shared/constants/ttl.constants.js';
import {
  notificationJobDataSchema,
  type NotificationJobDataValidated,
} from './notification.job.schema.js';

/** BullMQ queue name for asynchronous notification dispatch (in-app + email fan-out). */
export const NOTIFICATION_QUEUE_NAME = 'notification';

/** Only ids are stored in Redis; content is loaded in the worker from Postgres with organization scoping. */
export type NotificationJobData = NotificationJobDataValidated;

let notificationQueue: Queue<NotificationJobData> | null = null;

function getNotificationQueue(): Queue<NotificationJobData> {
  if (notificationQueue) return notificationQueue;
  notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
    connection: getBullMQProducerConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
    defaultJobOptions: {
      removeOnComplete: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      removeOnFail: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      attempts: 3,
      backoff: { type: 'exponential', delay: FIVE_SECONDS_MS },
    },
  });
  return notificationQueue;
}

/**
 * Builds the BullMQ job id for a notification's dispatch: the notification's public id.
 *
 * @remarks
 * - **Algorithm:** the public id (`ntf_…`) as-is — the queue name is already part of every key
 *   (`<prefix>bull:notification:<job id>`), so a `notification-` prefix would only cost bytes.
 *   `notificationPublicId: null` is a post-commit task recorded by the release before this one
 *   (that task carries only the bigserial); it keeps the legacy `notification-<id>` id.
 * - **Failure modes:** none — pure string builder.
 * - **Side effects:** none.
 * - **Notes:** not the bigserial `id`: it restarts at 1 after `TRUNCATE ... RESTART IDENTITY` or
 *   a database restore while Redis keeps finished jobs for up to 7 days, and BullMQ silently
 *   drops an add whose job id still exists — the new notification would never be dispatched.
 */
export function buildNotificationJobId(options: {
  notificationId: number;
  notificationPublicId: string | null;
}): string {
  return options.notificationPublicId ?? `notification-${String(options.notificationId)}`;
}

/**
 * Enqueue a notification for async delivery across configured channels.
 */
export async function enqueueNotification(options: {
  notificationId: number;
  notificationPublicId: string | null;
  organizationPublicId: string | null;
  requestId?: string;
}): Promise<void> {
  const { notificationId, notificationPublicId, organizationPublicId, requestId } = options;
  const queue = getNotificationQueue();
  const jobData = parseBullMQJobData(
    notificationJobDataSchema,
    omitUndefined({
      notificationId,
      organizationPublicId,
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
  // job id is the notification's public id, unique across databases (see buildNotificationJobId).
  await queue.add('dispatch-notification', jobData, {
    jobId: buildNotificationJobId({ notificationId, notificationPublicId }),
  });
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
