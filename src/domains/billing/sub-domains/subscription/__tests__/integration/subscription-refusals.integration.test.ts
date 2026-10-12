import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestSubscription } from '@/domains/billing/__tests__/factories/subscription.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestPlan } from '@/tests/factories/plan.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';

// A configured provider that bills a plan only through the plan's own provider price — the real
// `getProviderPriceId` rule — so a plan without a price is refused before any provider call.
vi.mock('@/domains/billing/sub-domains/subscription/stripe-payment-provider.js', async () => {
  const { FakePaymentProvider } = await import(
    '@/domains/billing/__tests__/factories/fake-payment-provider.js'
  );
  return { StripePaymentProvider: FakePaymentProvider };
});

const SUBSCRIPTION_PERMISSIONS = ['subscription:read', 'subscription:manage'];

/** The error envelope of a refused request. */
function errorOf(response: { json: () => unknown }): { detail?: string; reason?: string } {
  return (response.json() as { error: { detail?: string; reason?: string } }).error;
}

/** The English detail of `errors:planNotAvailableForBillingCycle`. */
const PLAN_NOT_AVAILABLE = "This plan is not available for your subscription's billing cycle";

/**
 * The billing refusals no other suite drives over HTTP: a plan the configured provider cannot bill
 * (create and change-plan), yearly billing on a free plan, a subscription that can no longer change,
 * an unknown subscription id, and a create or plan change that another request is already running.
 */
describe('Billing subscription — refusals over HTTP', () => {
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
    return { user, organization, token };
  }

  function postSubscription({
    token,
    planPublicId,
    billingCycle,
  }: {
    token: string;
    planPublicId: string;
    billingCycle: 'monthly' | 'yearly';
  }) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/billing/subscriptions'),
      token,
      headers: { 'x-idempotency-key': `refusal-create-${randomUUID()}` },
      payload: { plan_id: planPublicId, billing_cycle: billingCycle },
    });
  }

  function changePlan({
    token,
    subscriptionPublicId,
    planPublicId,
  }: {
    token: string;
    subscriptionPublicId: string;
    planPublicId: string;
  }) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath(`/billing/subscriptions/${subscriptionPublicId}/change-plan`),
      token,
      headers: { 'x-idempotency-key': `refusal-change-${randomUUID()}` },
      payload: { plan_id: planPublicId },
    });
  }

  it('refuses to create a subscription on a plan the configured provider has no price for (422)', async () => {
    const { token } = await billingManager();
    const plan = await createTestPlan(); // no Stripe price for either cycle

    const response = await postSubscription({
      token,
      planPublicId: plan.public_id,
      billingCycle: 'monthly',
    });

    expect(response.statusCode, response.body).toBe(422);
    expect(errorOf(response).detail).toBe(PLAN_NOT_AVAILABLE);
  });

  it('refuses the cycle the plan has no provider price for, and creates on the one it has', async () => {
    const { token } = await billingManager();
    const plan = await createTestPlan({ stripePriceMonthlyId: 'price_monthly_only' });

    const yearly = await postSubscription({
      token,
      planPublicId: plan.public_id,
      billingCycle: 'yearly',
    });
    expect(yearly.statusCode, yearly.body).toBe(422);

    const monthly = await postSubscription({
      token,
      planPublicId: plan.public_id,
      billingCycle: 'monthly',
    });
    expect(monthly.statusCode, monthly.body).toBe(200);
  });

  it('refuses yearly billing on a free plan, whatever the provider holds (422)', async () => {
    const { token } = await billingManager();
    const freePlan = await createTestPlan({
      priceMonthly: '0.00',
      priceYearly: '0.00',
      stripePriceMonthlyId: 'price_free_monthly',
      stripePriceYearlyId: 'price_free_yearly',
    });

    const response = await postSubscription({
      token,
      planPublicId: freePlan.public_id,
      billingCycle: 'yearly',
    });

    expect(response.statusCode, response.body).toBe(422);
    expect(errorOf(response).detail).toBe(PLAN_NOT_AVAILABLE);
  });

  it('refuses to move a provider-backed subscription to a plan with no provider price (422)', async () => {
    const { user, organization, token } = await billingManager();
    const currentPlan = await createTestPlan({ stripePriceMonthlyId: 'price_current' });
    const unpricedPlan = await createTestPlan();
    const subscription = await createTestSubscription({
      organizationId: organization.id,
      planId: currentPlan.id,
      providerSubscriptionId: `sub_backed_${randomUUID()}`,
      createdByUserId: user.id,
    });

    const response = await changePlan({
      token,
      subscriptionPublicId: subscription.public_id,
      planPublicId: unpricedPlan.public_id,
    });

    expect(response.statusCode, response.body).toBe(422);
    expect(errorOf(response).detail).toBe(PLAN_NOT_AVAILABLE);
  });

  it('refuses to change or cancel a subscription that has ended (422)', async () => {
    const { user, organization, token } = await billingManager();
    const plan = await createTestPlan({ stripePriceMonthlyId: 'price_ended' });
    const otherPlan = await createTestPlan({ stripePriceMonthlyId: 'price_other' });
    const ended = await createTestSubscription({
      organizationId: organization.id,
      planId: plan.id,
      status: 'CANCELED',
      createdByUserId: user.id,
    });

    const change = await changePlan({
      token,
      subscriptionPublicId: ended.public_id,
      planPublicId: otherPlan.public_id,
    });
    expect(change.statusCode, change.body).toBe(422);

    const cancel = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath(`/billing/subscriptions/${ended.public_id}/cancel`),
      token,
      headers: { 'x-idempotency-key': `refusal-cancel-${randomUUID()}` },
      payload: {},
    });
    expect(cancel.statusCode, cancel.body).toBe(422);
  });

  it('answers 404 for a subscription id the organization does not have', async () => {
    const { token } = await billingManager();

    const response = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/billing/subscriptions/sub_unknown00000000000000'),
      token,
    });

    expect(response.statusCode, response.body).toBe(404);
  });

  it('answers 409 subscription_create_in_progress while another create holds the organization', async () => {
    const { organization, token } = await billingManager();
    const plan = await createTestPlan({ stripePriceMonthlyId: 'price_locked' });
    const lockKey = `billing:subscription:create:${organization.public_id}`;
    await redisConnection.set(lockKey, 'another-request', 'EX', 30);
    try {
      const response = await postSubscription({
        token,
        planPublicId: plan.public_id,
        billingCycle: 'monthly',
      });

      expect(response.statusCode, response.body).toBe(409);
      expect(errorOf(response).reason).toBe('subscription_create_in_progress');
    } finally {
      await redisConnection.del(lockKey);
    }
  }, 30_000);

  it('answers 409 subscription_change_in_progress while another plan change holds the subscription', async () => {
    const { user, organization, token } = await billingManager();
    const plan = await createTestPlan({ stripePriceMonthlyId: 'price_from' });
    const nextPlan = await createTestPlan({ stripePriceMonthlyId: 'price_to' });
    const subscription = await createTestSubscription({
      organizationId: organization.id,
      planId: plan.id,
      createdByUserId: user.id,
    });
    const lockKey = `billing:subscription:change-plan:${subscription.public_id}`;
    await redisConnection.set(lockKey, 'another-request', 'EX', 30);
    try {
      const response = await changePlan({
        token,
        subscriptionPublicId: subscription.public_id,
        planPublicId: nextPlan.public_id,
      });

      expect(response.statusCode, response.body).toBe(409);
      expect(errorOf(response).reason).toBe('subscription_change_in_progress');
    } finally {
      await redisConnection.del(lockKey);
    }
  }, 30_000);
});
