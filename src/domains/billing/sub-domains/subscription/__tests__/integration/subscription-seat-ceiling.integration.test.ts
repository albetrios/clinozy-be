import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { generateTestTokenWithActiveSession } from '@/tests/helpers/test-auth.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestPlan } from '@/tests/factories/plan.factory.js';
import { createTestSubscription } from '@/domains/billing/__tests__/factories/subscription.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  MEMBERSHIP_WRITE_PERMISSION_CODES,
  seedPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { BILLING_PERMISSIONS } from '@/domains/billing/billing.permissions.js';
import { subscriptions } from '@/domains/billing/sub-domains/subscription/subscription.schema.js';
import { processSubscriptionSeatSyncJob } from '@/domains/billing/sub-domains/subscription/workers/subscription-seat-sync.processor.js';
import { createWorkerContainers } from '@/worker-containers.js';

/**
 * The seat ceiling after the seat sync has run (launch ROUTE #165, D82).
 *
 * Every member add enqueues the seat sync, which writes the member count into
 * `subscriptions.seats` (the Stripe quantity the clinic is billed for). The add check used to read
 * that same column as the limit (`seats ?? included_seats`), so one add plus one sync capped a
 * subscribed organization at its current size — and an unlimited plan at its headcount. The
 * ceiling is now the plan's `included_seats`, raised only by a quantity paid for above it.
 *
 * Drives the real add route and the real seat-sync processor (a local-only subscription, so the
 * sync persists `seats` without calling Stripe).
 */
describe('Subscription seat ceiling after the seat sync (ROUTE #165)', () => {
  let app: FastifyInstance;
  const PERMISSION_CODES = [
    TENANCY_PERMISSIONS.MEMBERSHIP_READ,
    ...MEMBERSHIP_WRITE_PERMISSION_CODES,
    TENANCY_PERMISSIONS.ORGANIZATION_READ,
    BILLING_PERMISSIONS.SUBSCRIPTION_READ,
  ];

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    app = testApplication;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedPermissions(PERMISSION_CODES);
  });

  /** An organization whose owner holds one seat, subscribed (local-only) to a plan of `includedSeats`. */
  async function createSubscribedOrganization(includedSeats: number | null) {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const ownerRole = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: PERMISSION_CODES,
    });
    await createMembership({
      userId: owner.id,
      organizationId: organization.id,
      roleId: ownerRole.id,
    });
    const plan = await createTestPlan({ includedSeats });
    const subscription = await createTestSubscription({
      organizationId: organization.id,
      planId: plan.id,
      status: 'ACTIVE',
      provider: null,
      providerSubscriptionId: null,
    });
    const { token } = await generateTestTokenWithActiveSession(app, owner.public_id, {
      organizationPublicId: organization.public_id,
    });
    const memberRole = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [TENANCY_PERMISSIONS.MEMBERSHIP_READ],
    });
    return { organization, subscription, token, memberRole };
  }

  async function addMember(token: string, memberRolePublicId: string) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/tenancy/organization/memberships'),
      token,
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      payload: { email: `seat-${randomUUID()}@test.com`, role_ids: [memberRolePublicId] },
    });
  }

  /** Runs the seat-sync job the add enqueued, as the worker would. */
  async function runSeatSync(organizationPublicId: string) {
    await processSubscriptionSeatSyncJob(
      { organizationPublicId },
      createWorkerContainers().billingDomain.subscriptionService,
    );
  }

  async function readSyncedSeats(subscriptionId: number) {
    const [row] = await getOperatorDatabase()
      .select({ seats: subscriptions.seats })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId));
    return row?.seats ?? null;
  }

  it('a plan of 5 seats still takes a third member after one add and its seat sync', async () => {
    const { organization, subscription, token, memberRole } = await createSubscribedOrganization(5);

    const first = await addMember(token, memberRole.public_id);
    expect(first.statusCode).toBe(200);
    await runSeatSync(organization.public_id);
    // The sync wrote the headcount (owner + the invited member) — the billed quantity.
    expect(await readSyncedSeats(subscription.id)).toBe(2);

    const second = await addMember(token, memberRole.public_id);
    expect(second.statusCode).toBe(200);

    // The subscription reads the same ceiling the add check enforces.
    const read = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath(`/billing/subscriptions/${subscription.public_id}`),
      token,
    });
    expect(read.statusCode).toBe(200);
    const data = (read.json() as { data: { seats_total: number | null; seats_used: number } }).data;
    expect(data.seats_total).toBe(5);
    expect(data.seats_used).toBe(3);
  });

  it('keeps refusing past the plan seats once they are filled, synced or not', async () => {
    const { organization, token, memberRole } = await createSubscribedOrganization(3);

    expect((await addMember(token, memberRole.public_id)).statusCode).toBe(200);
    await runSeatSync(organization.public_id);
    expect((await addMember(token, memberRole.public_id)).statusCode).toBe(200);
    await runSeatSync(organization.public_id);

    const refused = await addMember(token, memberRole.public_id);
    expect(refused.statusCode).toBe(409);
    expect((refused.json() as { error: { reason?: string } }).error.reason).toBe(
      'seat_limit_reached',
    );
  });

  it('an unlimited plan stays unlimited after the seat sync', async () => {
    const { organization, token, memberRole } = await createSubscribedOrganization(null);

    expect((await addMember(token, memberRole.public_id)).statusCode).toBe(200);
    await runSeatSync(organization.public_id);
    expect((await addMember(token, memberRole.public_id)).statusCode).toBe(200);
  });

  it('honours a quantity paid for above the plan seats', async () => {
    const { subscription, token, memberRole } = await createSubscribedOrganization(1);
    // The clinic bought 2 seats on a 1-seat plan (a Stripe quantity above the plan, synced in).
    await getOperatorDatabase()
      .update(subscriptions)
      .set({ seats: 2 })
      .where(eq(subscriptions.id, subscription.id));

    expect((await addMember(token, memberRole.public_id)).statusCode).toBe(200);
    const refused = await addMember(token, memberRole.public_id);
    expect(refused.statusCode).toBe(409);
  });
});
