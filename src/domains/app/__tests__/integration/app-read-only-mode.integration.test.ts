import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env } from '@/shared/config/env.config.js';
import { database } from '@/infrastructure/database/connection.js';
import { NEW_ORGANIZATION_TRIAL_DAYS } from '@/shared/constants/billing.constants.js';
import { provisionOrganizationWithOwner } from '@/domains/tenancy/sub-domains/organization/organization-provisioning.js';
import { seedAllPermissions } from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { createTestSubscription } from '@/domains/billing/__tests__/factories/subscription.factory.js';
import { createTestPlan } from '@/tests/factories/plan.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

const DAY = 24 * 60 * 60 * 1000;

type PlanAccessBody = { state: string; grace_ends_at: string | null };

/**
 * Read-only mode for unpaid clinics (owner decision D3, 2026-10-17), end to end: with
 * `BILLING_READ_ONLY_ENFORCED` on, a TEAM clinic without a paid plan past its grace gets 403
 * `organization_read_only` on every write under `/api/v1/app/` while its reads, billing and tenancy
 * stay open; a clinic in its grace or on a paid plan writes; `GET /auth/me/context` reports each
 * state as `active_organization.plan_access`. With the flag off (the default) nothing changes.
 */
describe('Read-only mode for unpaid clinics — integration (D3)', () => {
  let app: FastifyInstance;
  let paidPlanId: number;
  const originalEnforced = env.BILLING_READ_ONLY_ENFORCED;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    await seedAllPermissions();
    await createTestPlan({
      name: `Free ${randomUUID()}`,
      priceMonthly: '0.00',
      priceYearly: '0.00',
    });
    paidPlanId = (await createTestPlan({ name: `Clinic ${randomUUID()}`, priceMonthly: '1999.00' }))
      .id;
  });

  afterEach(() => {
    env.BILLING_READ_ONLY_ENFORCED = originalEnforced;
  });

  afterAll(async () => {
    env.BILLING_READ_ONLY_ENFORCED = originalEnforced;
    await app.close();
  });

  /**
   * A TEAM clinic provisioned the way signup does, `createdDaysAgo` old, with its owner's token;
   * `subscription` adds a local subscription row on the paid plan whose period ended that many days
   * ago (negative: still running).
   */
  async function clinic(options: {
    createdDaysAgo: number;
    subscription?: { status: string; periodEndedDaysAgo: number };
  }) {
    const stamp = randomUUID().slice(0, 8);
    const owner = await createTestUser({ email: `owner.${stamp}@read-only.example` });
    const { organization } = await provisionOrganizationWithOwner({
      name: `Read-only clinic ${stamp}`,
      slug: `read-only-${stamp}`,
      type: 'TEAM',
      ownerUserId: owner.id,
    });
    const createdAt = new Date(Date.now() - options.createdDaysAgo * DAY);
    await operatorQuery`
      UPDATE tenancy.organizations SET created_at = ${createdAt} WHERE id = ${organization.id}
    `;
    let subscriptionPublicId: string | null = null;
    if (options.subscription) {
      const row = await createTestSubscription({
        organizationId: organization.id,
        planId: paidPlanId,
        status: options.subscription.status,
      });
      const periodEnd = new Date(Date.now() - options.subscription.periodEndedDaysAgo * DAY);
      await operatorQuery`
        UPDATE billing.subscriptions
        SET current_period_start = ${new Date(periodEnd.getTime() - 30 * DAY)},
            current_period_end = ${periodEnd}
        WHERE id = ${row.id}
      `;
      subscriptionPublicId = row.public_id;
    }
    const token = await generateTestToken({
      userId: owner.public_id,
      organizationPublicId: organization.public_id,
    });
    return { organization, createdAt, token, subscriptionPublicId };
  }

  const createBranch = (token: string) =>
    injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/app/branches'),
      token,
      headers: { 'x-idempotency-key': `read-only-${randomUUID()}` },
      payload: {
        name: `Vesu ${randomUUID().slice(0, 6)}`,
        address_line_one: '12 Ring Road',
        area: 'Vesu',
        city: 'Surat',
        postal_code: '395007',
        phone: '+919876543210',
        email: `vesu.${randomUUID().slice(0, 8)}@read-only.example`,
      },
    });

  const listBranches = (token: string) =>
    injectAuthenticated(app, { method: 'GET', url: testApiPath('/app/branches'), token });

  async function planAccess(token: string): Promise<PlanAccessBody> {
    const response = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/auth/me/context'),
      token,
    });
    expect(response.statusCode, response.body).toBe(200);
    return (response.json() as { data: { active_organization: { plan_access: PlanAccessBody } } })
      .data.active_organization.plan_access;
  }

  const reasonOf = (body: string) =>
    (JSON.parse(body) as { error?: { reason?: string } }).error?.reason;

  it('a clinic past its trial is read-only: writes under /app answer 403 organization_read_only, reads 200', async () => {
    env.BILLING_READ_ONLY_ENFORCED = true;
    const { token, createdAt } = await clinic({ createdDaysAgo: 40 });

    const create = await createBranch(token);
    expect(create.statusCode, create.body).toBe(403);
    expect(reasonOf(create.body)).toBe('organization_read_only');

    const remove = await injectAuthenticated(app, {
      method: 'DELETE',
      url: testApiPath(`/app/appointments/${generatePublicId('appointment')}?reason=mistake`),
      token,
    });
    expect(remove.statusCode, remove.body).toBe(403);
    expect(reasonOf(remove.body)).toBe('organization_read_only');

    const read = await listBranches(token);
    expect(read.statusCode, read.body).toBe(200);

    expect(await planAccess(token)).toEqual({
      state: 'read_only',
      grace_ends_at: new Date(
        createdAt.getTime() + NEW_ORGANIZATION_TRIAL_DAYS * DAY,
      ).toISOString(),
    });
  });

  it('a read-only clinic can still pay and manage its team: billing and tenancy stay writable', async () => {
    env.BILLING_READ_ONLY_ENFORCED = true;
    const { token, subscriptionPublicId } = await clinic({
      createdDaysAgo: 120,
      subscription: { status: 'PAST_DUE', periodEndedDaysAgo: 30 },
    });
    expect((await planAccess(token)).state).toBe('read_only');

    const rename = await injectAuthenticated(app, {
      method: 'PATCH',
      url: testApiPath('/tenancy/organization'),
      token,
      payload: { name: `Renamed ${randomUUID().slice(0, 6)}` },
    });
    expect(rename.statusCode, rename.body).toBe(200);

    const cancel = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath(`/billing/subscriptions/${subscriptionPublicId}/cancel`),
      token,
      headers: { 'x-idempotency-key': `read-only-${randomUUID()}` },
      payload: {},
    });
    expect(cancel.statusCode, cancel.body).toBe(200);
  });

  it('a new clinic in its trial grace writes, and me/context says until when', async () => {
    env.BILLING_READ_ONLY_ENFORCED = true;
    const { token, createdAt } = await clinic({ createdDaysAgo: 3 });

    const create = await createBranch(token);
    expect(create.statusCode, create.body).toBe(200);
    expect(await planAccess(token)).toEqual({
      state: 'grace',
      grace_ends_at: new Date(
        createdAt.getTime() + NEW_ORGANIZATION_TRIAL_DAYS * DAY,
      ).toISOString(),
    });
  });

  it('a clinic on a paid plan writes and is active, however old', async () => {
    env.BILLING_READ_ONLY_ENFORCED = true;
    const { token } = await clinic({
      createdDaysAgo: 400,
      subscription: { status: 'ACTIVE', periodEndedDaysAgo: -10 },
    });

    const create = await createBranch(token);
    expect(create.statusCode, create.body).toBe(200);
    expect(await planAccess(token)).toEqual({ state: 'active', grace_ends_at: null });
  });

  it('a read-only clinic that pays writes again at once', async () => {
    env.BILLING_READ_ONLY_ENFORCED = true;
    const { token, organization } = await clinic({ createdDaysAgo: 60 });
    expect((await createBranch(token)).statusCode).toBe(403);

    await createTestSubscription({ organizationId: organization.id, planId: paidPlanId });

    const create = await createBranch(token);
    expect(create.statusCode, create.body).toBe(200);
    expect((await planAccess(token)).state).toBe('active');
  });

  it('me/context reads plan access inside its own unit of work: no extra transaction when on', async () => {
    const { token } = await clinic({ createdDaysAgo: 3 });
    const transactionsFor = async (enforced: boolean): Promise<number> => {
      env.BILLING_READ_ONLY_ENFORCED = enforced;
      await planAccess(token); // warm the session and permission caches
      const transactionSpy = vi.spyOn(database, 'transaction');
      try {
        await planAccess(token);
        return transactionSpy.mock.calls.length;
      } finally {
        transactionSpy.mockRestore();
      }
    };

    const off = await transactionsFor(false);
    const on = await transactionsFor(true);
    expect(on).toBe(off);
  });

  it('with BILLING_READ_ONLY_ENFORCED off (the default) nothing is blocked and every clinic is active', async () => {
    env.BILLING_READ_ONLY_ENFORCED = false;
    const { token } = await clinic({ createdDaysAgo: 400 });

    const create = await createBranch(token);
    expect(create.statusCode, create.body).toBe(200);
    expect(await planAccess(token)).toEqual({ state: 'active', grace_ends_at: null });
  });
});
