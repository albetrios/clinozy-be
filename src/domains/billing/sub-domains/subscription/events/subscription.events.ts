/**
 * Subscription resource events — emitted by {@link SubscriptionService} with the subscription's
 * public JSON and delivered to the organization's subscribed webhooks by the notify domain.
 * `CANCELLED` fires when the subscription reaches `CANCELED`; scheduling a cancellation at the
 * period end is an `UPDATED` (`cancel_at_period_end: true`).
 */
export const SUBSCRIPTION_EVENT = {
  CREATED: 'subscription.created',
  UPDATED: 'subscription.updated',
  CANCELLED: 'subscription.cancelled',
} as const;

/** Union of literal event codes defined by {@link SUBSCRIPTION_EVENT}. */
export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT)[keyof typeof SUBSCRIPTION_EVENT];
