import { randomUUID } from 'node:crypto';
import { Queue, type DeduplicationOptions } from 'bullmq';
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
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  subscriptionSeatSyncJobDataSchema,
  type SubscriptionSeatSyncJobDataValidated,
} from './subscription-seat-sync.job.schema.js';

/** BullMQ queue name for asynchronous Stripe seat-quantity reconciliation (REQ-4). */
export const SUBSCRIPTION_SEAT_SYNC_QUEUE_NAME = 'subscription-seat-sync';

/** Validated payload shape for jobs on the {@link SUBSCRIPTION_SEAT_SYNC_QUEUE_NAME} queue. */
export type SubscriptionSeatSyncJobData = SubscriptionSeatSyncJobDataValidated;

let subscriptionSeatSyncQueue: Queue<SubscriptionSeatSyncJobData> | null = null;

function getSubscriptionSeatSyncQueue(): Queue<SubscriptionSeatSyncJobData> {
  if (subscriptionSeatSyncQueue) return subscriptionSeatSyncQueue;
  subscriptionSeatSyncQueue = new Queue<SubscriptionSeatSyncJobData>(
    SUBSCRIPTION_SEAT_SYNC_QUEUE_NAME,
    {
      connection: getBullMQProducerConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      defaultJobOptions: {
        removeOnComplete: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
        removeOnFail: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
        attempts: 5,
        backoff: { type: 'exponential', delay: FIVE_SECONDS_MS, jitter: QUEUE_RETRY_JITTER_RATIO },
      },
    },
  );
  return subscriptionSeatSyncQueue;
}

/**
 * One seat sync per organization at a time, on any replica — BullMQ `deduplication` keyed by the
 * organization, with `keepLastIfActive`.
 *
 * @remarks
 * - **Algorithm:** while the organization's job waits or sits delayed (a retry backoff, a Stripe
 *   outage park) a further add is dropped — that job has not read the member count yet, so it will
 *   see the newest one. While the job runs, a further add is stored, and when the running job
 *   finishes it becomes ONE new job with the latest add's data: a membership change that landed
 *   after the running job read the count is synced right after it.
 * - **Failure modes:** none — pure options. The key is released when the job completes or fails
 *   (a stalled job fails through the same path); a key whose job Redis lost is recovered by the
 *   next add.
 * - **Side effects:** none.
 * - **Notes:** without it two replicas could run two jobs for one organization at once, and the one
 *   that read the older member count could finish last — leaving Stripe (and `subscriptions.seats`)
 *   on the wrong quantity until the next membership change. It also collapses a burst of member
 *   changes into one Stripe update.
 */
export function subscriptionSeatSyncDeduplication(
  organizationPublicId: string,
): DeduplicationOptions {
  return { id: `seat-sync-${organizationPublicId}`, keepLastIfActive: true };
}

/**
 * Enqueues a seat-quantity-sync job for an organization (REQ-4). Each enqueue gets a UNIQUE `jobId`
 * (`seat-sync-${organizationPublicId}-${uuid}`) and the organization's deduplication key
 * ({@link subscriptionSeatSyncDeduplication}): jobs for one organization never overlap, and the
 * last one to run read the live member count after the last change — it reconciles the final state.
 *
 * @remarks
 * - **Algorithm:** validates the payload, then `queue.add` with a per-enqueue unique `jobId` and the
 *   per-organization deduplication.
 * - **Failure modes:** propagates BullMQ enqueue errors; callers in the request path swallow them
 *   so a Redis blip never fails member management (the change already committed locally).
 * - **Side effects:** writes at most one job to the seat-sync queue (none while the organization's
 *   job is still waiting).
 * - **Notes:** a STABLE per-organization jobId would be silently no-op'd by BullMQ whenever a prior job with
 *   that id is still RETAINED (completed or failed) — the exact duplicate-jobId trap the Stripe
 *   webhook reclaim path documents as sec-re-02 — leaving Stripe billing a stale seat count until the
 *   retained job aged out. The deduplication key is released on completion or failure, so it never
 *   has that trap. Retries of one job still reuse that job's stored idempotency token, so a retried
 *   Stripe update is deduped, not duplicated.
 */
export async function enqueueSubscriptionSeatSync(options: {
  organizationPublicId: string;
  requestId?: string;
  idempotencyKey?: string;
}): Promise<void> {
  const queue = getSubscriptionSeatSyncQueue();
  const jobData = parseBullMQJobData({
    schema: subscriptionSeatSyncJobDataSchema,
    data: omitUndefined({
      organizationPublicId: options.organizationPublicId,
      requestId: options.requestId,
      idempotencyKey: options.idempotencyKey,
      ...captureTraceContextForPropagation(),
    }),
    queueName: SUBSCRIPTION_SEAT_SYNC_QUEUE_NAME,
  });
  await queue.add('sync-subscription-seats', jobData, {
    jobId: `seat-sync-${options.organizationPublicId}-${randomUUID()}`,
    deduplication: subscriptionSeatSyncDeduplication(options.organizationPublicId),
  });
}

/**
 * Best-effort fire-and-forget enqueue used by the request path (member add/remove, change-plan):
 * a Redis failure is logged and swallowed so seat reconciliation never blocks or fails the
 * primary operation. A lost enqueue is not retried: the organization's next membership change
 * syncs the live count again (there is no periodic seat reconciliation yet).
 */
export function enqueueSubscriptionSeatSyncBestEffort(options: {
  organizationPublicId: string;
  requestId?: string;
  idempotencyKey?: string;
}): void {
  void enqueueSubscriptionSeatSync(options).catch((error: unknown) => {
    logger.warn(
      { error, organizationPublicId: options.organizationPublicId },
      'subscription.seat_sync.enqueue_failed',
    );
  });
}

/** Closes the lazily-initialised seat-sync queue connection during graceful shutdown. */
export async function closeSubscriptionSeatSyncQueue(): Promise<void> {
  if (subscriptionSeatSyncQueue) {
    await subscriptionSeatSyncQueue.close();
    subscriptionSeatSyncQueue = null;
  }
}
