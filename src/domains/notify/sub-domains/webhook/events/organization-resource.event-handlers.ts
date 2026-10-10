import { eventBus, type DomainEvent } from '@/core/events/event-bus.js';
import type { OrganizationResourceEventPayload } from '@/core/events/organization-resource-event.js';
import { SUBSCRIPTION_EVENT } from '@/domains/billing/sub-domains/subscription/events/subscription.events.js';
import { MEMBERSHIP_EVENT } from '@/domains/tenancy/sub-domains/membership/events/membership.events.js';
import { ORGANIZATION_EVENT } from '@/domains/tenancy/sub-domains/organization/events/organization.events.js';
import type { WebhookService } from '@/domains/notify/sub-domains/webhook/webhook.service.js';

let organizationResourceEventHandlersRegistered = false;

/**
 * Idempotent registrar subscribing the webhook fan-out to every organization resource event the
 * webhook catalog advertises (`WEBHOOK_EVENT_TYPES`; the registrar's unit test keeps the two
 * lists equal), so each event the tenancy and billing services emit reaches the organization's
 * subscribed webhooks.
 *
 * @remarks
 * - **Algorithm:** the listener hands the event's organization, type and public JSON to
 *   {@link WebhookService.dispatchOrganizationWebhooks}, which records the PENDING attempts in the
 *   producer's transaction and enqueues them after it commits.
 * - **Failure modes:** a dispatch failure propagates to the bus, which logs it, alerts and swallows
 *   it — the producer's write is never failed by webhook fan-out.
 * - **Side effects:** none at registration; one listener per event type.
 */
export function registerOrganizationResourceEventHandlers(webhookService: WebhookService): void {
  if (organizationResourceEventHandlersRegistered) return;
  organizationResourceEventHandlersRegistered = true;
  const onOrganizationResourceEvent = async (event: DomainEvent): Promise<void> => {
    const payload = event.payload as OrganizationResourceEventPayload;
    await webhookService.dispatchOrganizationWebhooks({
      organizationPublicId: payload.organization_public_id,
      eventType: event.type,
      data: payload.data,
    });
  };
  eventBus.on(ORGANIZATION_EVENT.CREATED, onOrganizationResourceEvent);
  eventBus.on(ORGANIZATION_EVENT.UPDATED, onOrganizationResourceEvent);
  eventBus.on(MEMBERSHIP_EVENT.CREATED, onOrganizationResourceEvent);
  eventBus.on(MEMBERSHIP_EVENT.UPDATED, onOrganizationResourceEvent);
  eventBus.on(MEMBERSHIP_EVENT.DELETED, onOrganizationResourceEvent);
  eventBus.on(SUBSCRIPTION_EVENT.CREATED, onOrganizationResourceEvent);
  eventBus.on(SUBSCRIPTION_EVENT.UPDATED, onOrganizationResourceEvent);
  eventBus.on(SUBSCRIPTION_EVENT.CANCELLED, onOrganizationResourceEvent);
}
