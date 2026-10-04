import { Queue } from 'bullmq';
import {
  getBullMQKeyPrefix,
  getBullMQProducerConnectionOptions,
} from '@/infrastructure/queue/connection.js';
import { DEFAULT_JOB_RETENTION_COUNT } from '@/infrastructure/queue/queue.constants.js';
import { captureTraceContextForPropagation } from '@/infrastructure/observability/tracing/trace-context.util.js';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { SEVEN_DAYS_SECONDS } from '@/shared/constants/ttl.constants.js';
import {
  webhookDeliveryJobDataSchema,
  type WebhookDeliveryJobDataValidated,
} from './webhook-delivery.job.schema.js';

/** BullMQ queue name for outbound webhook delivery (HMAC-signed POSTs to customer URLs). */
export const WEBHOOK_DELIVERY_QUEUE_NAME = 'webhook-delivery';

/** Total BullMQ job attempts (initial + retries). Worker derives its final-attempt guard from this. */
export const WEBHOOK_DELIVERY_JOB_ATTEMPTS = 5;

/** Delivery attempt id and organization scope are stored in Redis; payload and secrets live in Postgres. */
export type WebhookDeliveryJobData = WebhookDeliveryJobDataValidated;

let webhookDeliveryQueue: Queue<WebhookDeliveryJobData> | null = null;

function getWebhookDeliveryQueue(): Queue<WebhookDeliveryJobData> {
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
export async function enqueueWebhookDeliveryByAttemptId(options: {
  deliveryAttemptId: number;
  deliveryAttemptPublicId: string;
  organizationPublicId: string;
  requestId?: string;
}): Promise<void> {
  const { deliveryAttemptId, deliveryAttemptPublicId, organizationPublicId, requestId } = options;
  const queue = getWebhookDeliveryQueue();
  const jobData = parseBullMQJobData(
    webhookDeliveryJobDataSchema,
    omitUndefined({
      deliveryAttemptId,
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
