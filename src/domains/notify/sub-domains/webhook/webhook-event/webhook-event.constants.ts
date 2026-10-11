import { BILLING_PERMISSIONS } from '@/domains/billing/billing.permissions.js';
import { SUBSCRIPTION_EVENT } from '@/domains/billing/sub-domains/subscription/events/subscription.events.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
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

/**
 * The read permission a webhook needs to subscribe to each event type — the permission the API
 * itself requires to read that resource, so a webhook cannot receive what its owner could not read.
 * `null`: the resource is readable by every member (`GET /tenancy/organization`).
 */
export const WEBHOOK_EVENT_READ_PERMISSION: Readonly<Record<WebhookEventType, string | null>> = {
  [ORGANIZATION_EVENT.CREATED]: null,
  [ORGANIZATION_EVENT.UPDATED]: null,
  [MEMBERSHIP_EVENT.CREATED]: TENANCY_PERMISSIONS.MEMBERSHIP_READ,
  [MEMBERSHIP_EVENT.UPDATED]: TENANCY_PERMISSIONS.MEMBERSHIP_READ,
  [MEMBERSHIP_EVENT.DELETED]: TENANCY_PERMISSIONS.MEMBERSHIP_READ,
  [SUBSCRIPTION_EVENT.CREATED]: BILLING_PERMISSIONS.SUBSCRIPTION_READ,
  [SUBSCRIPTION_EVENT.UPDATED]: BILLING_PERMISSIONS.SUBSCRIPTION_READ,
  [SUBSCRIPTION_EVENT.CANCELLED]: BILLING_PERMISSIONS.SUBSCRIPTION_READ,
};
