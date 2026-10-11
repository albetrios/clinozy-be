import { registerWebhookDeliveryEventHandlers } from '@/domains/notify/sub-domains/webhook/webhook-delivery/events/webhook-delivery.event-handlers.js';
import { registerMembershipInvitationNotificationHandlers } from '@/domains/notify/sub-domains/notification/events/membership-invitation.event-handlers.js';
import { registerOrganizationResourceEventHandlers } from '@/domains/notify/sub-domains/webhook/events/organization-resource.event-handlers.js';
import type { WebhookService } from '@/domains/notify/sub-domains/webhook/webhook.service.js';

let notifyEventHandlersRegistered = false;

/**
 * Aggregate registrar that wires every notify-domain event handler exactly once
 * (idempotent — safe to call from `notify.container` and from boot paths). Takes the container's
 * {@link WebhookService}, which the organization resource handlers fan out through.
 */
export function registerNotifyEventHandlers(dependencies: {
  webhookService: WebhookService;
}): void {
  if (notifyEventHandlersRegistered) return;
  notifyEventHandlersRegistered = true;
  registerWebhookDeliveryEventHandlers();
  registerMembershipInvitationNotificationHandlers();
  registerOrganizationResourceEventHandlers(dependencies.webhookService);
}
