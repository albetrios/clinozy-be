import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  paymentProviderCalls,
  resetPaymentProviderCalls,
} from '@/domains/billing/__tests__/factories/fake-payment-provider.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestPlan } from '@/tests/factories/plan.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';

vi.mock('@/domains/billing/sub-domains/subscription/stripe-payment-provider.js', async () => {
  const { FakePaymentProvider } = await import(
    '@/domains/billing/__tests__/factories/fake-payment-provider.js'
  );
  return { StripePaymentProvider: FakePaymentProvider };
});

const SUBSCRIPTION_PERMISSIONS = ['subscription:read', 'subscription:manage'];

type SubscriptionBody = {
  id: string;
  status: string;
  billing_cycle: string;
  plan_id: string | null;
  cancel_at_period_end: boolean;
  provider: string | null;
  seats_used: number;
};

/** The subscription a billing route answered with. */
function subscriptionOf(response: { json: () => unknown }): SubscriptionBody {
  return (response.json() as { data: SubscriptionBody }).data;
}

/**
 * One subscription's whole life over HTTP, against a payment provider that keeps Stripe's rules
 * (`FakePaymentProvider`): create on the plan's provider price, read it back, move it to another
 * plan, cancel at the period end, resume — and what reached the provider at each step.
 */
describe('Billing subscription — lifecycle over HTTP', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    app = testApplication;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    resetPaymentProviderCalls();
  });

  async function billingManager() {
    await seedPermissions(SUBSCRIPTION_PERMISSIONS);
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: SUBSCRIPTION_PERMISSIONS,
      createdByUserId: user.id,
    });
    await createMembership({ userId: user.id, organizationId: organization.id, roleId: role.id });
    const token = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: organization.public_id,
    });
    return { token };
  }

  function post({ token, path, payload }: { token: string; path: string; payload: object }) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath(path),
      token,
      headers: { 'x-idempotency-key': `lifecycle-${randomUUID()}` },
      payload,
    });
  }

  it('creates, reads, changes plan, cancels at period end and resumes', async () => {
    const { token } = await billingManager();
    const starter = await createTestPlan({
      stripePriceMonthlyId: 'price_starter_monthly',
      stripePriceYearlyId: 'price_starter_yearly',
    });
    const growth = await createTestPlan({
      stripePriceMonthlyId: 'price_growth_monthly',
      stripePriceYearlyId: 'price_growth_yearly',
    });

    // Create — yearly, on the plan's yearly provider price, billed for the one member.
    const created = await post({
      token,
      path: '/billing/subscriptions',
      payload: { plan_id: starter.public_id, billing_cycle: 'yearly' },
    });
    expect(created.statusCode, created.body).toBe(200);
    const subscription = subscriptionOf(created);
    expect(subscription).toMatchObject({
      billing_cycle: 'YEARLY',
      plan_id: starter.public_id,
      cancel_at_period_end: false,
      provider: 'stripe',
    });
    expect(subscription.status.toUpperCase()).toBe('ACTIVE');
    expect(paymentProviderCalls[0]).toEqual({
      method: 'createSubscription',
      providerPriceId: 'price_starter_yearly',
      billingCycle: 'yearly',
      quantity: 1,
    });

    // Read — the same subscription, by id and as the organization's list.
    const read = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath(`/billing/subscriptions/${subscription.id}`),
      token,
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(subscriptionOf(read).id).toBe(subscription.id);

    // Change plan — the provider price follows the subscription's own (yearly) cycle.
    const changed = await post({
      token,
      path: `/billing/subscriptions/${subscription.id}/change-plan`,
      payload: { plan_id: growth.public_id },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(subscriptionOf(changed).plan_id).toBe(growth.public_id);
    expect(paymentProviderCalls).toContainEqual(
      expect.objectContaining({
        method: 'updateSubscriptionPrice',
        providerPriceId: 'price_growth_yearly',
      }),
    );

    // Cancel at the period end — the subscription stays, flagged to end.
    const canceled = await post({
      token,
      path: `/billing/subscriptions/${subscription.id}/cancel`,
      payload: {},
    });
    expect(canceled.statusCode, canceled.body).toBe(200);
    expect(subscriptionOf(canceled).cancel_at_period_end).toBe(true);
    expect(paymentProviderCalls).toContainEqual(
      expect.objectContaining({ method: 'cancelSubscriptionAtPeriodEnd' }),
    );

    // Resume — the flag is lifted.
    const resumed = await post({
      token,
      path: `/billing/subscriptions/${subscription.id}/resume`,
      payload: {},
    });
    expect(resumed.statusCode, resumed.body).toBe(200);
    expect(subscriptionOf(resumed).cancel_at_period_end).toBe(false);
    expect(paymentProviderCalls).toContainEqual(
      expect.objectContaining({ method: 'resumeSubscription' }),
    );
  });

  it('refuses a second subscription while the first one is live (409)', async () => {
    const { token } = await billingManager();
    const plan = await createTestPlan({ stripePriceMonthlyId: 'price_only_one' });

    const first = await post({
      token,
      path: '/billing/subscriptions',
      payload: { plan_id: plan.public_id, billing_cycle: 'monthly' },
    });
    expect(first.statusCode, first.body).toBe(200);

    const second = await post({
      token,
      path: '/billing/subscriptions',
      payload: { plan_id: plan.public_id, billing_cycle: 'monthly' },
    });
    expect(second.statusCode, second.body).toBe(409);
    expect(
      paymentProviderCalls.filter((call) => call.method === 'createSubscription'),
    ).toHaveLength(1);
  });
});
