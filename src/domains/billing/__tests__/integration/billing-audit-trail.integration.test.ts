import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { audit_outbox } from '@/domains/audit/audit-outbox.schema.js';
import { logs } from '@/domains/audit/audit.schema.js';
import { runAuditOutboxDrainJob } from '@/domains/audit/workers/audit-outbox-drain.processor.js';
import { createTestSubscription } from '@/domains/billing/__tests__/factories/subscription.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestPlan } from '@/tests/factories/plan.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';

// The payment provider is replaced at its port so a subscription can be created without Stripe —
// the same fake the subscription happy-path suite uses.
vi.mock('@/domains/billing/sub-domains/subscription/stripe-payment-provider.js', () => {
  class FakeStripePaymentProvider {
    isConfigured(): boolean {
      return true;
    }
    getProviderPriceId(): string {
      return 'price_test_fake';
    }
    async createSubscription(): Promise<{
      providerSubscriptionId: string;
      providerCustomerId: string;
    }> {
      return {
        providerSubscriptionId: `sub_fake_${randomUUID()}`,
        providerCustomerId: `cus_fake_${randomUUID()}`,
      };
    }
    async cancelSubscriptionAtPeriodEnd(): Promise<void> {}
    async cancelSubscriptionImmediately(): Promise<void> {}
    async resumeSubscription(): Promise<void> {}
    async updateSubscriptionPrice(): Promise<void> {}
  }
  return { StripePaymentProvider: FakeStripePaymentProvider };
});

const SUBSCRIPTION_PERMISSIONS = ['subscription:read', 'subscription:manage'];

/**
 * Subscription changes decide what an organization pays for and how many seats it has, yet none of
 * them reached the audit log although `docs/reference/security/audit-logs.md` listed them. Each
 * case drives the real route, reads the staged outbox row, then runs the real drain.
 */
describe('billing audit trail — subscription changes reach the audit log', () => {
  let application: FastifyInstance;

  beforeAll(async () => {
    const { app } = await createTestApp();
    application = app;
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedPermissions(SUBSCRIPTION_PERMISSIONS);
  });

  async function createBillingContext() {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: SUBSCRIPTION_PERMISSIONS,
    });
    await createMembership({ userId: user.id, organizationId: organization.id, roleId: role.id });
    const token = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: organization.public_id,
    });
    return { user, organization, token };
  }

  async function post(options: { token: string; path: string; payload?: Record<string, unknown> }) {
    return injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath(options.path),
      token: options.token,
      headers: { 'x-idempotency-key': `billing-audit-${randomUUID()}` },
      ...(options.payload ? { payload: options.payload } : {}),
    });
  }

  async function stagedRows(action: string) {
    return getOperatorDatabase().select().from(audit_outbox).where(eq(audit_outbox.action, action));
  }

  async function persistedRows(action: string) {
    return getOperatorDatabase().select().from(logs).where(eq(logs.action, action));
  }

  async function expectEveryStagedRowToDrain() {
    const result = await withMaintenanceDatabaseContext({
      scope: MAINTENANCE_SCOPE.AUDIT_OUTBOX_DRAIN,
      callback: (databaseHandle) => runAuditOutboxDrainJob(databaseHandle),
    });
    expect(result.transientFailed + result.permanentlyFailed).toBe(0);
    const outbox = await getOperatorDatabase().select().from(audit_outbox);
    expect(outbox.filter((row) => row.status !== 'PROCESSED')).toEqual([]);
    const ledger = await getOperatorDatabase().select().from(logs).orderBy(logs.id);
    const secondPass = await withMaintenanceDatabaseContext({
      scope: MAINTENANCE_SCOPE.AUDIT_OUTBOX_DRAIN,
      callback: (databaseHandle) => runAuditOutboxDrainJob(databaseHandle),
    });
    expect(secondPass).toEqual({ drained: 0, transientFailed: 0, permanentlyFailed: 0 });
    expect(await getOperatorDatabase().select().from(logs).orderBy(logs.id)).toEqual(ledger);
  }

  it('records a new subscription with its plan', async () => {
    const { user, organization, token } = await createBillingContext();
    const plan = await createTestPlan();

    const response = await post({
      token,
      path: '/billing/subscriptions',
      payload: { plan_id: plan.public_id, billing_cycle: 'monthly' },
    });
    expect(response.statusCode, response.body).toBe(200);
    const subscriptionId = (response.json() as { data: { id: string } }).data.id;

    expect(await stagedRows('billing.subscription.create')).toEqual([
      expect.objectContaining({
        actor_user_public_id: user.public_id,
        organization_public_id: organization.public_id,
        metadata: { subscription_public_id: subscriptionId, plan_public_id: plan.public_id },
      }),
    ]);
    await expectEveryStagedRowToDrain();
    expect(await persistedRows('billing.subscription.create')).toEqual([
      expect.objectContaining({
        actor_user_id: user.id,
        organization_id: organization.id,
        metadata: { subscription_public_id: subscriptionId, plan_public_id: plan.public_id },
      }),
    ]);
  });

  it('records a plan change, a cancellation and a resumption', async () => {
    const { user, organization, token } = await createBillingContext();
    const plan = await createTestPlan();
    // Local-only (no provider id), so the transitions run deterministically without Stripe.
    const subscription = await createTestSubscription({
      organizationId: organization.id,
      planId: plan.id,
      status: 'ACTIVE',
      providerSubscriptionId: null,
    });
    const newPlan = await createTestPlan({ name: 'Bigger Plan' });
    const path = `/billing/subscriptions/${subscription.public_id}`;

    expect(
      (await post({ token, path: `${path}/change-plan`, payload: { plan_id: newPlan.public_id } }))
        .statusCode,
    ).toBe(200);
    expect((await post({ token, path: `${path}/cancel` })).statusCode).toBe(200);
    expect((await post({ token, path: `${path}/resume` })).statusCode).toBe(200);

    for (const action of [
      'billing.subscription.change_plan',
      'billing.subscription.cancel',
      'billing.subscription.resume',
    ]) {
      expect(await stagedRows(action)).toEqual([
        expect.objectContaining({
          actor_user_public_id: user.public_id,
          organization_public_id: organization.public_id,
          metadata: {
            subscription_public_id: subscription.public_id,
            plan_public_id: newPlan.public_id,
          },
        }),
      ]);
    }
    await expectEveryStagedRowToDrain();
    for (const action of [
      'billing.subscription.change_plan',
      'billing.subscription.cancel',
      'billing.subscription.resume',
    ]) {
      expect(await persistedRows(action)).toEqual([
        expect.objectContaining({
          actor_user_id: user.id,
          organization_id: organization.id,
          metadata: {
            subscription_public_id: subscription.public_id,
            plan_public_id: newPlan.public_id,
          },
        }),
      ]);
    }
  });
});
