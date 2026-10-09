import {
  runGlobalRetentionWorkerJob,
  type WorkerDatabaseHandle,
} from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { findOrganizationsWithQueuedMessages } from '@/domains/app/sub-domains/contacts/contact-activities/contact-message-delivery.repository.js';
import { enqueueContactMessageDelivery } from '@/domains/app/sub-domains/contacts/contact-activities/queues/contact-message-delivery.queue.js';
import { CONTACT_MESSAGE_DELIVERY_SWEEP_BATCH } from '@/domains/app/sub-domains/contacts/contact-activities/workers/contact-message-delivery.constants.js';
import { findOrganizationsWithPendingDayCloseSummaries } from '@/domains/app/sub-domains/billing/day-closes/day-close-summary.repository.js';
import { findOrganizationsWithPendingMessagingEvents } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.repository.js';
import { enqueueMessagingWebhookEventProcessing } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/queues/messaging-webhook-event.queue.js';
import {
  isMessagingDeliveryEnabled,
  isMetaWebhookIngressConfigured,
} from '@/infrastructure/messaging/meta-messaging.config.js';

/**
 * What the messaging sweep re-enqueued (its return value, logged as `contact-messaging-sweep.completed`).
 *
 * @remarks
 * - **Notes:** `deliveryEnqueuedCount` — organizations given a delivery job (for a queued message
 *   or a day-close summary, D78); `eventEnqueuedCount` — given a processing job; `failedCount` —
 *   adds Redis refused (retried next minute).
 */
export interface ContactMessagingSweepCounts {
  deliveryEnqueuedCount: number;
  eventEnqueuedCount: number;
  failedCount: number;
}

/** The organizations a delivery job should run for: a queued message, or a day waiting for its summary. */
async function findOrganizationsWithDelivery(
  handle: WorkerDatabaseHandle,
  afterId: number,
): Promise<{ id: number; publicId: string }[]> {
  const queued = await findOrganizationsWithQueuedMessages(handle, afterId);
  const summaries = await findOrganizationsWithPendingDayCloseSummaries(handle, {
    afterId,
    limit: CONTACT_MESSAGE_DELIVERY_SWEEP_BATCH,
  });
  const byId = new Map(
    [...queued, ...summaries].map((organization) => [organization.id, organization]),
  );
  const merged = [...byId.values()];
  merged.sort((left, right) => left.id - right.id);
  return merged.slice(0, CONTACT_MESSAGE_DELIVERY_SWEEP_BATCH);
}

/** Pages through organizations the `find` read returns and enqueues each; answers the counts. */
async function sweep(options: {
  find: (
    handle: WorkerDatabaseHandle,
    afterId: number,
  ) => Promise<{ id: number; publicId: string }[]>;
  enqueue: (organizationPublicId: string) => Promise<void>;
  label: string;
}): Promise<{ enqueuedCount: number; failedCount: number }> {
  let enqueuedCount = 0;
  let failedCount = 0;
  let afterId = 0;
  for (;;) {
    const batch = await runGlobalRetentionWorkerJob((handle) => options.find(handle, afterId));
    for (const organization of batch) {
      try {
        await options.enqueue(organization.publicId);
        enqueuedCount += 1;
      } catch (error) {
        failedCount += 1;
        logger.warn(
          { error, organizationPublicId: organization.publicId },
          `${options.label}.enqueue_failed`,
        );
      }
    }
    if (batch.length < CONTACT_MESSAGE_DELIVERY_SWEEP_BATCH) break;
    afterId = batch[batch.length - 1]?.id ?? afterId;
  }
  return { enqueuedCount, failedCount };
}

/**
 * The one-minute messaging sweep (launch D77): the safety net under both messaging queues — an
 * organization with a queued message no live job holds, or a closed day whose summary has not gone
 * (D78, WC-10), gets a delivery job; one with a pending callback a processing job.
 *
 * @remarks
 * - **Algorithm:** each half pages through organizations in id order, one short read per batch
 *   under the global retention cleanup context; after each read the context closes and each
 *   organization's job is added (deduplicated per organization). A half whose channel is off
 *   (`MESSAGING_DELIVERY_ENABLED`, the webhook secrets) does nothing.
 * - **Failure modes:** a failed add is logged and skipped — the next minute adds it again; a read
 *   error propagates so BullMQ retries.
 * - **Side effects:** jobs on `contact-message-delivery` and `messaging-webhook-event`.
 */
export async function runContactMessagingSweepJob(): Promise<ContactMessagingSweepCounts> {
  const delivery = isMessagingDeliveryEnabled()
    ? await sweep({
        find: findOrganizationsWithDelivery,
        enqueue: enqueueContactMessageDelivery,
        label: 'contact-message-delivery',
      })
    : { enqueuedCount: 0, failedCount: 0 };
  const events = isMetaWebhookIngressConfigured()
    ? await sweep({
        find: findOrganizationsWithPendingMessagingEvents,
        enqueue: enqueueMessagingWebhookEventProcessing,
        label: 'messaging-webhook-event',
      })
    : { enqueuedCount: 0, failedCount: 0 };
  const counts = {
    deliveryEnqueuedCount: delivery.enqueuedCount,
    eventEnqueuedCount: events.enqueuedCount,
    failedCount: delivery.failedCount + events.failedCount,
  };
  logger.info(counts, 'contact-messaging-sweep.completed');
  return counts;
}
