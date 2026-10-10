import { SUBSCRIPTION_EVENT } from '@/domains/billing/sub-domains/subscription/events/subscription.events.js';
import { MEMBERSHIP_EVENT } from '@/domains/tenancy/sub-domains/membership/events/membership.events.js';
import { ORGANIZATION_EVENT } from '@/domains/tenancy/sub-domains/organization/events/organization.events.js';
import type { WebhookEvent } from './webhook-event.types.js';

/**
 * Static catalog of webhook event types that the platform can dispatch.
 *
 * This nested sub-domain intentionally omits `*.dto.ts`, `*.validator.ts`, and `*.schema.ts`:
 *   - the only route (`GET /webhook-events`) accepts no params or body, so there is nothing to validate;
 *   - the catalog has no database table — entries live here, named by the producing domains' event
 *     constants, and each is emitted by its producer and fanned out by the notify webhook handler.
 * If the catalog ever moves to the database, add a schema and (if relevant) a query DTO/validator.
 */
const AVAILABLE_WEBHOOK_EVENTS: WebhookEvent[] = [
  { event: ORGANIZATION_EVENT.CREATED, description: 'When an organization is created' },
  { event: ORGANIZATION_EVENT.UPDATED, description: 'When an organization is updated' },
  { event: MEMBERSHIP_EVENT.CREATED, description: 'When a membership is created' },
  { event: MEMBERSHIP_EVENT.UPDATED, description: 'When a membership is updated' },
  { event: MEMBERSHIP_EVENT.DELETED, description: 'When a membership is deleted' },
  { event: SUBSCRIPTION_EVENT.CREATED, description: 'When a subscription is created' },
  { event: SUBSCRIPTION_EVENT.UPDATED, description: 'When a subscription is updated' },
  { event: SUBSCRIPTION_EVENT.CANCELLED, description: 'When a subscription is cancelled' },
];

/** The event types customers can subscribe to — the handler subscribes to exactly these. */
export const WEBHOOK_EVENT_TYPES: readonly string[] = AVAILABLE_WEBHOOK_EVENTS.map(
  (entry) => entry.event,
);

/**
 * In-memory repository over the static {@link AVAILABLE_WEBHOOK_EVENTS} catalog. Wraps the
 * literal array so the public surface stays a `Repository` and a future migration to a database
 * table is a drop-in change for callers.
 */
export class WebhookEventRepository {
  async list(): Promise<WebhookEvent[]> {
    return [...AVAILABLE_WEBHOOK_EVENTS];
  }
}
