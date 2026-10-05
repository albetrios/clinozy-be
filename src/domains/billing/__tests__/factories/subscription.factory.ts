import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { subscriptions } from '@/domains/billing/sub-domains/subscription/subscription.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

export interface CreateTestSubscriptionOptions {
  organizationId: number;
  planId: number;
  status?: string;
  billingCycle?: string;
  /**
   * Provider name. When omitted: `'stripe'` for a Stripe-backed row (a
   * `providerSubscriptionId` is given), else `null`.
   */
  provider?: string | null;
  /**
   * Provider subscription id. Omitted (the default), the row is local-only and
   * cancel/resume/change-plan mutate it directly. Pass an id for a Stripe-backed
   * row — the service then calls Stripe, so the suite must stub
   * `@/infrastructure/payment/stripe.client.js`; no test may reach the real API.
   */
  providerSubscriptionId?: string | null;
  /**
   * Provider (Stripe) customer id stored on the row. Needed by billing endpoints that resolve the
   * customer from the active subscription (e.g. `POST /billing/payment-methods/setup`). Defaults to
   * `null` (no customer), matching the pre-existing behavior for tests that don't need one.
   */
  providerCustomerId?: string | null;
  createdByUserId?: number;
}

/**
 * Insert a subscription row for tests.
 *
 * @remarks
 * - **Local-only (default):** no `provider_subscription_id`, so mutation endpoints
 *   exercise the database transition logic and never call Stripe.
 * - **Stripe-backed:** pass `providerSubscriptionId`. The subscription service then
 *   calls Stripe on cancel/resume/change-plan and is fail-closed — a failed call
 *   surfaces as `ServiceUnavailableError` (503). Stub the Stripe client in that
 *   suite (see billing-subscription-mutations.integration.test.ts).
 */
export async function createTestSubscription(options: CreateTestSubscriptionOptions) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const providerSubscriptionId = options.providerSubscriptionId ?? null;
  const provider =
    options.provider !== undefined ? options.provider : providerSubscriptionId ? 'stripe' : null;

  const [subscription] = await getOperatorDatabase()
    .insert(subscriptions)
    .values({
      public_id: generatePublicId('subscription'),
      organization_id: options.organizationId,
      plan_id: options.planId,
      billing_cycle: options.billingCycle ?? 'MONTHLY',
      status: options.status ?? 'ACTIVE',
      provider,
      provider_subscription_id: providerSubscriptionId,
      provider_customer_id: options.providerCustomerId ?? null,
      current_period_start: now,
      current_period_end: periodEnd,
      created_by_user_id: options.createdByUserId,
    })
    .returning();

  return subscription!;
}
