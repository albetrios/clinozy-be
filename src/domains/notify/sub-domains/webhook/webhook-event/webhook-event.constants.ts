import { SUBSCRIPTION_EVENT } from '@/domains/billing/sub-domains/subscription/events/subscription.events.js';
import { MEMBERSHIP_EVENT } from '@/domains/tenancy/sub-domains/membership/events/membership.events.js';
import { ORGANIZATION_EVENT } from '@/domains/tenancy/sub-domains/organization/events/organization.events.js';

/**
 * The event types a webhook can subscribe to — exactly the catalog `GET /notify/webhook-events`
 * serves, named by the producing domains' event constants. A webhook's `events` are validated
 * against it, and the notify fan-out subscribes to each one.
 */
export const WEBHOOK_EVENT_TYPES = [
  ORGANIZATION_EVENT.CREATED,
  ORGANIZATION_EVENT.UPDATED,
  MEMBERSHIP_EVENT.CREATED,
  MEMBERSHIP_EVENT.UPDATED,
  MEMBERSHIP_EVENT.DELETED,
  SUBSCRIPTION_EVENT.CREATED,
  SUBSCRIPTION_EVENT.UPDATED,
  SUBSCRIPTION_EVENT.CANCELLED,
] as const;

/** One subscribable webhook event type (a member of {@link WEBHOOK_EVENT_TYPES}). */
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
