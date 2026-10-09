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
import { isMetaWebhookIngressConfigured } from '@/infrastructure/messaging/meta-messaging.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';
import { SEVEN_DAYS_SECONDS } from '@/shared/constants/ttl.constants.js';
import {
  type MessagingWebhookEventJobData,
  messagingWebhookEventJobDataSchema,
} from './messaging-webhook-event.job.schema.js';

/** BullMQ queue that applies one organization's stored messaging callbacks (D77). */
export const MESSAGING_WEBHOOK_EVENT_QUEUE_NAME = 'messaging-webhook-event';

/** First retry after 30 seconds, then exponential. */
const RETRY_DELAY_MS = 30_000;

let eventQueue: Queue<MessagingWebhookEventJobData> | null = null;

function getEventQueue(): Queue<MessagingWebhookEventJobData> {
  if (eventQueue) return eventQueue;
  eventQueue = new Queue<MessagingWebhookEventJobData>(MESSAGING_WEBHOOK_EVENT_QUEUE_NAME, {
    connection: getBullMQProducerConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
    defaultJobOptions: {
      removeOnComplete: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      removeOnFail: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      attempts: 5,
      backoff: { type: 'exponential', delay: RETRY_DELAY_MS, jitter: QUEUE_RETRY_JITTER_RATIO },
    },
  });
  return eventQueue;
}

/**
 * One waiting processing job per organization, plus one more while it runs — a callback stored
 * while a job applies the ones before it is picked up by the job kept behind it (D77).
 */
export function messagingWebhookEventDeduplication(
  organizationPublicId: string,
): DeduplicationOptions {
  return { id: `messaging-webhook-event-${organizationPublicId}`, keepLastIfActive: true };
}

/**
 * Enqueues an organization's messaging webhook processing job (launch D77) — a no-op while the
 * webhook is not configured (`META_APP_SECRET` / `META_WEBHOOK_VERIFY_TOKEN` unset).
 *
 * @remarks
 * - **Algorithm:** validates the payload, then `queue.add` with a unique `jobId` and the
 *   organization's deduplication key.
 * - **Failure modes:** propagates BullMQ enqueue errors (the stored callbacks stay `pending`; the
 *   one-minute messaging sweep enqueues the organization again).
 * - **Side effects:** at most one waiting job per organization.
 */
export async function enqueueMessagingWebhookEventProcessing(
  organizationPublicId: string,
): Promise<void> {
  if (!isMetaWebhookIngressConfigured()) return;
  const jobData = parseBullMQJobData(
    messagingWebhookEventJobDataSchema,
    { organizationPublicId, ...captureTraceContextForPropagation() },
    MESSAGING_WEBHOOK_EVENT_QUEUE_NAME,
  );
  await getEventQueue().add('apply-messaging-webhook-events', jobData, {
    jobId: `messaging-webhook-event-${organizationPublicId}-${randomUUID()}`,
    deduplication: messagingWebhookEventDeduplication(organizationPublicId),
  });
}

/**
 * {@link enqueueMessagingWebhookEventProcessing} that never throws — the webhook has stored the
 * callback and must still answer 200; the sweep recovers a lost enqueue.
 *
 * @remarks
 * - **Failure modes:** none — an enqueue error is logged (`messaging-webhook-event.enqueue_failed`).
 */
export async function requestMessagingWebhookEventProcessing(
  organizationPublicId: string,
): Promise<void> {
  try {
    await enqueueMessagingWebhookEventProcessing(organizationPublicId);
  } catch (error) {
    logger.warn({ error, organizationPublicId }, 'messaging-webhook-event.enqueue_failed');
  }
}

/** Closes the lazily created producer queue during graceful shutdown. */
export async function closeMessagingWebhookEventQueue(): Promise<void> {
  if (eventQueue) {
    await eventQueue.close();
    eventQueue = null;
  }
}
