import { SUBSCRIPTION_EVENT } from '@/domains/billing/sub-domains/subscription/events/subscription.events.js';
import { MEMBERSHIP_EVENT } from '@/domains/tenancy/sub-domains/membership/events/membership.events.js';
import { ORGANIZATION_EVENT } from '@/domains/tenancy/sub-domains/organization/events/organization.events.js';
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from './webhook-event.constants.js';
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
/** Customer-facing description per event type — typed so a new type cannot ship undescribed. */
const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  [ORGANIZATION_EVENT.CREATED]: 'When an organization is created',
  [ORGANIZATION_EVENT.UPDATED]: 'When an organization is updated',
  [MEMBERSHIP_EVENT.CREATED]: 'When a membership is created',
  [MEMBERSHIP_EVENT.UPDATED]: 'When a membership is updated',
  [MEMBERSHIP_EVENT.DELETED]: 'When a membership is deleted',
  [SUBSCRIPTION_EVENT.CREATED]: 'When a subscription is created',
  [SUBSCRIPTION_EVENT.UPDATED]: 'When a subscription is updated',
  [SUBSCRIPTION_EVENT.CANCELLED]: 'When a subscription is cancelled',
};

const AVAILABLE_WEBHOOK_EVENTS: WebhookEvent[] = WEBHOOK_EVENT_TYPES.map((event) => ({
  event,
  description: WEBHOOK_EVENT_DESCRIPTIONS[event],
}));

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
