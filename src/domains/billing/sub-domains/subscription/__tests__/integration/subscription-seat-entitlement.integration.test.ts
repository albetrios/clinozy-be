import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestPlan } from '@/tests/factories/plan.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedAllPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { createTestSubscription } from '@/domains/billing/__tests__/factories/subscription.factory.js';
import { createDomainContainers, type DomainContainers } from '@/worker-containers.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { subscriptions } from '@/domains/billing/sub-domains/subscription/subscription.schema.js';
import { runSubscriptionSeatReconcileJob } from '@/domains/billing/sub-domains/subscription/workers/subscription-seat-reconcile.processor.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

const FREE_PLAN_SEATS = 2;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Losing the paid entitlement keeps the team (owner decision, 2026-10-17): when Stripe cancels the
 * subscription, or a dunning one's grace ends with no event at all, the loss is logged and no member
 * is suspended — suspending everyone past the Free allowance locked a clinic's staff out mid-day.
 * The hourly reconcile also re-enqueues a seat sync where Stripe bills a quantity other than the
 * seats in use.
 * Built from the worker's own composition root, so the membership port is wired as in production.
 */
describe('Losing the paid entitlement keeps the team', () => {
  let containers: DomainContainers;
  const stripePriceId = `price_seats_${generatePublicId('plan')}`;
  let paidPlanId: number;

  beforeAll(() => {
    containers = createDomainContainers();
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedAllPermissions();
    await createTestPlan({ name: 'Free', priceMonthly: '0.00', includedSeats: FREE_PLAN_SEATS });
    const paidPlan = await createTestPlan({
      name: 'Team',
      priceMonthly: '29.00',
      includedSeats: 10,
      stripePriceMonthlyId: stripePriceId,
    });
    paidPlanId = paidPlan.id;
  });

  /** A team of the owner plus `memberCount` members who joined one day apart, oldest first. */
  async function teamWithMembers(memberCount: number) {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id, type: 'TEAM' });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [],
    });
    const ownerMembership = await createMembership({
      userId: owner.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    const memberIds: number[] = [];
    for (let index = 0; index < memberCount; index++) {
      const member = await createTestUser();
      const membership = await createMembership({
        userId: member.id,
        organizationId: organization.id,
        roleId: role.id,
      });
      await getOperatorDatabase()
        .update(memberships)
        .set({ joined_at: new Date(Date.UTC(2026, 0, index + 2)) })
        .where(eq(memberships.id, membership.id));
      memberIds.push(membership.id);
    }
    // The owner joined last of all: suspension still never reaches the owner.
    await getOperatorDatabase()
      .update(memberships)
      .set({ joined_at: new Date(Date.UTC(2026, 5, 1)) })
      .where(eq(memberships.id, ownerMembership.id));
    return { organization, ownerMembershipId: ownerMembership.id, memberIds };
  }

  async function suspendedMembershipIds(organizationId: number): Promise<number[]> {
    const rows = await getOperatorDatabase()
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organization_id, organizationId),
          eq(memberships.status, MEMBERSHIP_STATUS.SUSPENDED),
        ),
      );
    return rows.map((row) => row.id).sort((left, right) => left - right);
  }

  it('keeps every member and logs the loss when Stripe cancels', async () => {
    const { organization } = await teamWithMembers(3);
    const warnings = vi.spyOn(logger, 'warn');
    const providerSubscriptionId = `sub_seats_${generatePublicId('subscription')}`;
    await createTestSubscription({
      organizationId: organization.id,
      planId: paidPlanId,
      providerSubscriptionId,
    });

    await containers.billingDomain.stripeWebhookService.handleEvent({
      event: {
        id: `evt_seats_${generatePublicId('subscription')}`,
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: providerSubscriptionId,
            customer: 'cus_seats',
            status: 'canceled',
            cancel_at_period_end: false,
            canceled_at: Math.floor(Date.now() / 1000),
            metadata: { organization_id: organization.public_id },
            items: { data: [{ price: { id: stripePriceId } }] },
          },
        },
      } as unknown as Stripe.Event,
    });

    // Owner + 3 members against an allowance of 2: the loss is logged after commit, nobody goes.
    await vi.waitFor(() => {
      expect(warnings).toHaveBeenCalledWith(
        { organizationPublicId: organization.public_id, status: 'CANCELED' },
        'billing.entitlement_lost',
      );
    });
    expect(await suspendedMembershipIds(organization.id)).toEqual([]);
    warnings.mockRestore();
  });

  it('the hourly reconcile reports an ended dunning grace without suspending, and re-syncs a drifted quantity', async () => {
    const lapsed = await teamWithMembers(2);
    const lapsedSubscription = await createTestSubscription({
      organizationId: lapsed.organization.id,
      planId: paidPlanId,
      status: 'PAST_DUE',
    });
    // The period ended long before the grace: no Stripe event marks that moment.
    await getOperatorDatabase()
      .update(subscriptions)
      .set({
        current_period_start: new Date(Date.now() - 90 * MILLISECONDS_PER_DAY),
        current_period_end: new Date(Date.now() - 60 * MILLISECONDS_PER_DAY),
      })
      .where(eq(subscriptions.id, lapsedSubscription.id));

    const drifted = await teamWithMembers(1);
    const driftedSubscription = await createTestSubscription({
      organizationId: drifted.organization.id,
      planId: paidPlanId,
      providerSubscriptionId: `sub_drift_${generatePublicId('subscription')}`,
    });
    await getOperatorDatabase()
      .update(subscriptions)
      .set({ seats: 1 })
      .where(eq(subscriptions.id, driftedSubscription.id));

    const subscriptionService = containers.billingDomain.subscriptionService;
    const enqueueSeatQuantitySync = vi
      .spyOn(subscriptionService, 'enqueueSeatQuantitySync')
      .mockImplementation(() => undefined);

    const result = await runSubscriptionSeatReconcileJob(subscriptionService);

    expect(result).toEqual({ quantityDriftCount: 1, entitlementLapsedCount: 1 });
    expect(enqueueSeatQuantitySync).toHaveBeenCalledWith({
      organization_public_id: drifted.organization.public_id,
    });
    // Owner + 2 members against an allowance of 2: reported as lapsed, nobody suspended.
    expect(await suspendedMembershipIds(lapsed.organization.id)).toEqual([]);
    expect(await suspendedMembershipIds(drifted.organization.id)).toEqual([]);
    enqueueSeatQuantitySync.mockRestore();
  });

  it('runs whole in the worker process without suspending anyone', async () => {
    // The worker refuses database access outside a context, so the pass must stay inside one: it
    // once suspended members and then looked them up after the commit with no context, which threw.
    const lapsed = await teamWithMembers(2);
    await createTestSubscription({
      organizationId: lapsed.organization.id,
      planId: paidPlanId,
      status: 'CANCELED',
    });
    const errors = vi.spyOn(logger, 'error');
    const previousRuntime = process.env.CLINOZY_BE_RUNTIME;
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    try {
      const result = await runSubscriptionSeatReconcileJob(
        containers.billingDomain.subscriptionService,
      );
      expect(result.entitlementLapsedCount).toBe(1);
    } finally {
      if (previousRuntime === undefined) delete process.env.CLINOZY_BE_RUNTIME;
      else process.env.CLINOZY_BE_RUNTIME = previousRuntime;
    }
    expect(await suspendedMembershipIds(lapsed.organization.id)).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
