import { Queue } from 'bullmq';
import {
  getBullMQKeyPrefix,
  getBullMQProducerConnectionOptions,
} from '@/infrastructure/queue/connection.js';
import { DEFAULT_JOB_RETENTION_COUNT } from '@/infrastructure/queue/queue.constants.js';
import { captureTraceContextForPropagation } from '@/infrastructure/observability/tracing/trace-context.util.js';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import {
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  SEVEN_DAYS_SECONDS,
} from '@/shared/constants/ttl.constants.js';
import {
  webhookDeliveryJobDataSchema,
  type WebhookDeliveryJobDataValidated,
} from './webhook-delivery.job.schema.js';

/** BullMQ queue name for outbound webhook delivery (HMAC-signed POSTs to customer URLs). */
export const WEBHOOK_DELIVERY_QUEUE_NAME = 'webhook-delivery';

/**
 * Base delay before each retry of a failed delivery, in order: minutes at first, then hours —
 * about a day in all, so a receiver that is down for an afternoon still gets the event.
 *
 * @remarks
 * Seconds-apart retries (the previous schedule spent five attempts in under three minutes) turned
 * any short receiver outage into a dead letter. The backoff adds up to 20% jitter on top
 * (`webhookDeliveryBackoffWithJitter`); the attempt row's `next_retry_at` shows the base delay.
 */
export const WEBHOOK_DELIVERY_RETRY_DELAYS_MS = [
  MILLISECONDS_PER_MINUTE,
  5 * MILLISECONDS_PER_MINUTE,
  30 * MILLISECONDS_PER_MINUTE,
  2 * MILLISECONDS_PER_HOUR,
  5 * MILLISECONDS_PER_HOUR,
  10 * MILLISECONDS_PER_HOUR,
  10 * MILLISECONDS_PER_HOUR,
] as const;

/** Total BullMQ job attempts (initial + one per retry delay). The worker's final-attempt guard. */
export const WEBHOOK_DELIVERY_JOB_ATTEMPTS = WEBHOOK_DELIVERY_RETRY_DELAYS_MS.length + 1;

/**
 * Base delay before the retry that follows `failedAttempts` failed attempts (1 = after the
 * first) — shared by the BullMQ backoff and the `next_retry_at` the worker records, so the two
 * never disagree.
 */
export function webhookDeliveryRetryBaseDelayMs(failedAttempts: number): number {
  const index = Math.min(Math.max(failedAttempts, 1), WEBHOOK_DELIVERY_RETRY_DELAYS_MS.length) - 1;
  return WEBHOOK_DELIVERY_RETRY_DELAYS_MS[index]!;
}

/** Delivery attempt public id and organization scope are stored in Redis; payload and secrets live in Postgres. */
export type WebhookDeliveryJobData = WebhookDeliveryJobDataValidated;

let webhookDeliveryQueue: Queue<WebhookDeliveryJobData> | null = null;

/**
 * The lazily-created producer for {@link WEBHOOK_DELIVERY_QUEUE_NAME}, carrying the queue's job
 * options (attempts, custom backoff, retention). Every add — the event-driven enqueue and DLQ
 * replays alike — goes through it so no job is created without them.
 */
export function getWebhookDeliveryQueue(): Queue<WebhookDeliveryJobData> {
  if (webhookDeliveryQueue) return webhookDeliveryQueue;
  webhookDeliveryQueue = new Queue<WebhookDeliveryJobData>(WEBHOOK_DELIVERY_QUEUE_NAME, {
    connection: getBullMQProducerConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
    defaultJobOptions: {
      removeOnComplete: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      removeOnFail: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      attempts: WEBHOOK_DELIVERY_JOB_ATTEMPTS,
      backoff: { type: 'custom' },
    },
  });
  return webhookDeliveryQueue;
}

/**
 * Enqueue delivery for an existing attempt row (payload loaded in worker from Postgres).
 * Called from notify event handlers only.
 */
export async function enqueueWebhookDelivery(options: {
  deliveryAttemptPublicId: string;
  organizationPublicId: string;
  requestId?: string;
}): Promise<void> {
  const { deliveryAttemptPublicId, organizationPublicId, requestId } = options;
  const queue = getWebhookDeliveryQueue();
  const jobData = parseBullMQJobData(
    webhookDeliveryJobDataSchema,
    omitUndefined({
      deliveryAttemptPublicId,
      organizationPublicId,
      requestId,
      ...captureTraceContextForPropagation(),
    }),
    WEBHOOK_DELIVERY_QUEUE_NAME,
  );
  // The job id dedupes a re-enqueue of the same attempt (BullMQ drops an add whose job id still
  // exists, retained for SEVEN_DAYS_SECONDS). It is the attempt's public id (`wda_…`) as-is: the
  // queue name is already part of every key, and the bigserial restarts at 1 after
  // `TRUNCATE ... RESTART IDENTITY` or a database restore while Redis keeps the old job — a new
  // attempt reusing the id would be dropped silently and its webhook never delivered.
  await queue.add('deliver-webhook', jobData, {
    jobId: deliveryAttemptPublicId,
  });
}

/** Close the lazily-initialised webhook-delivery queue (graceful-shutdown hook for tests/runtime). */
export async function closeWebhookDeliveryQueue(): Promise<void> {
  if (webhookDeliveryQueue) {
    await webhookDeliveryQueue.close();
    webhookDeliveryQueue = null;
  }
}
