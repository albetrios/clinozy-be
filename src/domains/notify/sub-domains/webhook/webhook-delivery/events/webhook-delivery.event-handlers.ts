import { eventBus, runEnqueueAfterCommit, type DomainEvent } from '@/core/events/event-bus.js';
import { enqueueWebhookDelivery } from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import { findOrganizationPublicIdByDeliveryAttemptPublicId } from '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import {
  NOTIFY_EVENT,
  type WebhookDeliveryRequestedPayload,
} from '@/domains/notify/sub-domains/webhook/events/notify.events.js';

async function onWebhookDeliveryRequestedEvent(event: DomainEvent): Promise<void> {
  const payload = event.payload as WebhookDeliveryRequestedPayload;
  const deliveryAttemptPublicId = payload.delivery_attempt_public_id;
  try {
    const organization_public_id =
      await findOrganizationPublicIdByDeliveryAttemptPublicId(deliveryAttemptPublicId);
    if (!organization_public_id) {
      throw new Error(`webhook.delivery.organization_not_found:${deliveryAttemptPublicId}`);
    }
    await runEnqueueAfterCommit(async () => {
      try {
        await enqueueWebhookDelivery(
          omitUndefined({
            deliveryAttemptPublicId,
            organizationPublicId: organization_public_id,
            requestId: event.requestId,
          }),
        );
      } catch (error) {
        // The attempt stays PENDING: the webhook-delivery-reclaim sweep re-enqueues it once
        // Redis takes writes again (producers fail fast while it is unreachable or full).
        logger.error({ error, deliveryAttemptPublicId }, 'notify.webhook_delivery.enqueue.failed');
      }
    });
  } catch (error) {
    logger.warn(
      { error, eventType: event.type, deliveryAttemptPublicId },
      'notify.webhook_delivery.enqueue.failed',
    );
  }
}

let webhookDeliveryEventHandlersRegistered = false;

/**
 * Idempotent registrar that subscribes the in-process listener for
 * {@link NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED} so emitting that event (after persisting a
 * pending attempt) results in a BullMQ delivery job once the surrounding transaction commits.
 */
export function registerWebhookDeliveryEventHandlers(): void {
  if (webhookDeliveryEventHandlersRegistered) return;
  webhookDeliveryEventHandlersRegistered = true;
  eventBus.on({
    eventType: NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED,
    handler: onWebhookDeliveryRequestedEvent,
  });
}
