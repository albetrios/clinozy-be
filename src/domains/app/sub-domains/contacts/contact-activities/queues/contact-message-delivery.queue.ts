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
import { isMessagingDeliveryEnabled } from '@/infrastructure/messaging/meta-messaging.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';
import { MILLISECONDS_PER_MINUTE, SEVEN_DAYS_SECONDS } from '@/shared/constants/ttl.constants.js';
import {
  type ContactMessageDeliveryJobData,
  contactMessageDeliveryJobDataSchema,
} from './contact-message-delivery.job.schema.js';

/** BullMQ queue that sends one organization's queued WhatsApp and Instagram messages (D77). */
export const CONTACT_MESSAGE_DELIVERY_QUEUE_NAME = 'contact-message-delivery';

let deliveryQueue: Queue<ContactMessageDeliveryJobData> | null = null;

function getDeliveryQueue(): Queue<ContactMessageDeliveryJobData> {
  if (deliveryQueue) return deliveryQueue;
  deliveryQueue = new Queue<ContactMessageDeliveryJobData>(CONTACT_MESSAGE_DELIVERY_QUEUE_NAME, {
    connection: getBullMQProducerConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
    defaultJobOptions: {
      removeOnComplete: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      removeOnFail: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      attempts: 5,
      // A minute — the `meta` circuit's reset window, so a retry lands after it half-opens.
      backoff: {
        type: 'exponential',
        delay: MILLISECONDS_PER_MINUTE,
        jitter: QUEUE_RETRY_JITTER_RATIO,
      },
    },
  });
  return deliveryQueue;
}

/**
 * One waiting delivery job per organization, plus one more while it runs — a message queued
 * while a job sends the batch before it is picked up by the job kept behind it (D77).
 */
export function contactMessageDeliveryDeduplication(
  organizationPublicId: string,
): DeduplicationOptions {
  return { id: `contact-message-delivery-${organizationPublicId}`, keepLastIfActive: true };
}

/**
 * Enqueues an organization's message delivery job (launch D77, WC-1) — a no-op while
 * `MESSAGING_DELIVERY_ENABLED` is off.
 *
 * @remarks
 * - **Algorithm:** validates the payload, then `queue.add` with a unique `jobId` and the
 *   organization's deduplication key ({@link contactMessageDeliveryDeduplication}).
 * - **Failure modes:** propagates BullMQ enqueue errors — the callers log them (the message stays
 *   `queued`; the one-minute messaging sweep enqueues the organization again).
 * - **Side effects:** at most one waiting job per organization.
 */
export async function enqueueContactMessageDelivery(organizationPublicId: string): Promise<void> {
  if (!isMessagingDeliveryEnabled()) return;
  const jobData = parseBullMQJobData({
    schema: contactMessageDeliveryJobDataSchema,
    data: { organizationPublicId, ...captureTraceContextForPropagation() },
    queueName: CONTACT_MESSAGE_DELIVERY_QUEUE_NAME,
  });
  await getDeliveryQueue().add('deliver-contact-messages', jobData, {
    jobId: `contact-message-delivery-${organizationPublicId}-${randomUUID()}`,
    deduplication: contactMessageDeliveryDeduplication(organizationPublicId),
  });
}

/**
 * {@link enqueueContactMessageDelivery} that never throws — for a write's after-commit step and
 * a worker's follow-up, where a Redis outage must not fail anything (the sweep recovers it).
 *
 * @remarks
 * - **Failure modes:** none — an enqueue error is logged (`contact-message-delivery.enqueue_failed`).
 */
export async function requestContactMessageDelivery(organizationPublicId: string): Promise<void> {
  try {
    await enqueueContactMessageDelivery(organizationPublicId);
  } catch (error) {
    logger.warn({ error, organizationPublicId }, 'contact-message-delivery.enqueue_failed');
  }
}

/** Closes the lazily created producer queue during graceful shutdown. */
export async function closeContactMessageDeliveryQueue(): Promise<void> {
  if (deliveryQueue) {
    await deliveryQueue.close();
    deliveryQueue = null;
  }
}
