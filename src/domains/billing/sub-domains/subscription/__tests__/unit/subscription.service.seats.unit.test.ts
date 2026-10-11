import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '@/shared/errors/index.js';

// REQ-4: stub the seat-sync producer queue so syncs never open Redis in unit tests.
const seatSyncMocks = vi.hoisted(() => ({ enqueueSubscriptionSeatSyncBestEffort: vi.fn() }));
vi.mock(
  '@/domains/billing/sub-domains/subscription/queues/subscription-seat-sync.queue.js',
  () => seatSyncMocks,
);

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Blanket maintenance passthrough: services this suite touches (directly or via
    // cross-domain imports) may enter maintenance contexts (tombstoning, admin reads) —
    // the real wrapper opens a database.transaction() and CI's unit lane has no Postgres.
    withMaintenanceDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
    withAppDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
  };
});

import {
  PRINCIPAL_SCOPE,
  type OrganizationPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';
import { SubscriptionService } from '@/domains/billing/sub-domains/subscription/subscription.service.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { PlanService } from '@/domains/billing/sub-domains/plan/plan.service.js';
import type { SubscriptionRepository } from '@/domains/billing/sub-domains/subscription/subscription.repository.js';
import type { PaymentProvider } from '@/domains/billing/sub-domains/subscription/payment-provider.port.js';
import type { MembershipSeatUsagePort } from '@/domains/billing/sub-domains/subscription/subscription.service.js';

const organization = { id: 1, public_id: 'org_public', name: 'Org', slug: 'org' };

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    public_id: 'sub_public',
    organization_id: 1,
    status: 'ACTIVE',
    billing_cycle: 'MONTHLY',
    seats: null,
    plan_public_id: 'pln_public',
    plan_included_seats: 10,
    provider: 'stripe',
    provider_subscription_id: 'sub_x',
    current_period_start: new Date('2026-05-01'),
    current_period_end: new Date('2026-06-01'),
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    created_at: new Date('2026-05-01'),
    updated_at: new Date('2026-05-01'),
    ...overrides,
  };
}

const scope = PRINCIPAL_SCOPE.REQUEST({
  userPublicId: 'user_public',
  organizationPublicId: 'org_public',
}) as OrganizationPrincipalDatabaseScope;

describe('SubscriptionService seat counters (REQ-4)', () => {
  const organizationService = {
    requireOrganizationByPublicId: vi.fn().mockResolvedValue(organization),
  } as unknown as OrganizationService;
  const planService = {
    getFreePlanSeatCeiling: vi.fn().mockResolvedValue(1),
  } as unknown as PlanService;
  const paymentProvider = {
    updateSubscriptionQuantity: vi.fn().mockResolvedValue(undefined),
  } as unknown as PaymentProvider;
  const repository = {
    listByOrganization: vi.fn(),
    findByPublicId: vi.fn(),
    findActiveByOrganization: vi.fn(),
    findActiveSeatStateByOrganizationForUpdate: vi.fn(),
    update: vi.fn().mockResolvedValue(baseRow()),
  } as unknown as SubscriptionRepository;
  const membershipSeatUsage: MembershipSeatUsagePort = {
    countActiveMembers: vi.fn().mockResolvedValue(3),
  };

  const service = new SubscriptionService(
    organizationService,
    planService,
    repository,
    paymentProvider,
    membershipSeatUsage,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(organizationService.requireOrganizationByPublicId).mockResolvedValue(
      organization as never,
    );
    vi.mocked(membershipSeatUsage.countActiveMembers).mockResolvedValue(3);
  });

  it('list() decorates rows with seats_total (plan.included_seats) and seats_used', async () => {
    vi.mocked(repository.listByOrganization).mockResolvedValue([
      baseRow({ seats: null, plan_included_seats: 10 }),
      baseRow({ public_id: 'sub_2', seats: 3, plan_included_seats: 10 }),
    ] as never);

    const rows = await service.list(scope);

    // The plan sets the allowance; `seats` is only the billed quantity seat sync wrote.
    expect(rows[0]!.seats_total).toBe(10);
    expect(rows[1]!.seats_total).toBe(10);
    // seats_used is the organization membership count, shared across rows; resolved once.
    expect(rows[0]!.seats_used).toBe(3);
    expect(rows[1]!.seats_used).toBe(3);
    expect(membershipSeatUsage.countActiveMembers).toHaveBeenCalledTimes(1);
  });

  it('get() seats_total is null when the plan is unlimited, whatever quantity is billed', async () => {
    vi.mocked(repository.findByPublicId).mockResolvedValue(
      baseRow({ seats: 4, plan_included_seats: null }) as never,
    );
    const row = await service.get({ scope, subscription_public_id: 'sub_public' });
    expect(row.seats_total).toBeNull();
    expect(row.seats_used).toBe(3);
  });

  it.each(['INCOMPLETE', 'PAUSED', 'PAST_DUE', 'UNPAID'])(
    'list and get report the enforced Free ceiling for %s without earned entitlement',
    async (status) => {
      const row = baseRow({
        status,
        seats: 99,
        current_period_end: new Date('2000-01-01'),
      });
      vi.mocked(planService.getFreePlanSeatCeiling).mockResolvedValue(1);
      vi.mocked(repository.listByOrganization).mockResolvedValue([row, row] as never);
      vi.mocked(repository.findByPublicId).mockResolvedValue(row as never);
      vi.mocked(repository.findActiveSeatStateByOrganizationForUpdate).mockResolvedValue(
        row as never,
      );

      const rows = await service.list(scope);
      expect(rows.map((item) => item.seats_total)).toEqual([1, 1]);
      expect(planService.getFreePlanSeatCeiling).toHaveBeenCalledTimes(1);
      expect((await service.get({ scope, subscription_public_id: 'sub_public' })).seats_total).toBe(
        1,
      );
      await expect(service.reserveSeatCeilingForMemberAdd(1)).resolves.toBe(1);
    },
  );

  it.each(['ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID'])(
    'list and enforcement retain paid seats for %s with current entitlement',
    async (status) => {
      const row = baseRow({
        status,
        seats: 3,
        plan_included_seats: 25,
        current_period_end: new Date(Date.now() + 86_400_000),
      });
      vi.mocked(repository.listByOrganization).mockResolvedValue([row] as never);
      vi.mocked(repository.findActiveSeatStateByOrganizationForUpdate).mockResolvedValue(
        row as never,
      );
      expect((await service.list(scope))[0]!.seats_total).toBe(25);
      await expect(service.reserveSeatCeilingForMemberAdd(1)).resolves.toBe(25);
      expect(planService.getFreePlanSeatCeiling).not.toHaveBeenCalled();
    },
  );

  it('keeps a finite paid allowance when grace expires during response decoration', async () => {
    vi.mocked(repository.listByOrganization).mockResolvedValue([
      baseRow({ status: 'PAST_DUE', plan_included_seats: 25, current_period_end: new Date(0) }),
    ] as never);
    const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(4_102_444_800_000);
    try {
      const rows = await service.list(scope);
      expect(rows[0]!.seats_total).toBe(25);
      expect(planService.getFreePlanSeatCeiling).not.toHaveBeenCalled();
      expect(clock).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });

  it('reserveSeatCeilingForMemberAdd falls back to the Free-tier ceiling when the organization has no active subscription (F3)', async () => {
    vi.mocked(repository.findActiveSeatStateByOrganizationForUpdate).mockResolvedValue(null);
    vi.mocked(planService.getFreePlanSeatCeiling).mockResolvedValue(1);
    await expect(service.reserveSeatCeilingForMemberAdd(1)).resolves.toBe(1);
    expect(planService.getFreePlanSeatCeiling).toHaveBeenCalledTimes(1);
  });

  it('reserveSeatCeilingForMemberAdd uses plan included_seats, never the synced billed quantity (active sub)', async () => {
    // Seat sync writes the member count to `subscriptions.seats`; that quantity never caps adds.
    vi.mocked(repository.findActiveSeatStateByOrganizationForUpdate).mockResolvedValueOnce({
      plan_included_seats: 25,
      status: 'ACTIVE',
      current_period_end: new Date('2026-06-01'),
    });
    await expect(service.reserveSeatCeilingForMemberAdd(1)).resolves.toBe(25);

    vi.mocked(repository.findActiveSeatStateByOrganizationForUpdate).mockResolvedValueOnce({
      plan_included_seats: 3,
      status: 'ACTIVE',
      current_period_end: new Date('2026-06-01'),
    });
    await expect(service.reserveSeatCeilingForMemberAdd(1)).resolves.toBe(3);
    expect(planService.getFreePlanSeatCeiling).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'INCOMPLETE', plan_included_seats: 25 },
    { status: 'INCOMPLETE', plan_included_seats: null },
    { status: 'PAUSED', plan_included_seats: 25 },
    { status: 'PAUSED', plan_included_seats: null },
  ])(
    'unpaid $status subscription uses Free ceiling for plan seats $plan_included_seats',
    async ({ status, plan_included_seats }) => {
      vi.mocked(repository.findActiveSeatStateByOrganizationForUpdate).mockResolvedValueOnce({
        plan_included_seats,
        status,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      vi.mocked(planService.getFreePlanSeatCeiling).mockResolvedValue(1);

      await expect(service.reserveSeatCeilingForMemberAdd(1)).resolves.toBe(1);
      expect(planService.getFreePlanSeatCeiling).toHaveBeenCalledTimes(1);
    },
  );

  it('reserveSeatCeilingForMemberAdd keeps the plan ceiling for a dunning sub WITHIN grace (F4)', async () => {
    // PAST_DUE, period ended yesterday — well within the default 14-day grace window.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    vi.mocked(repository.findActiveSeatStateByOrganizationForUpdate).mockResolvedValueOnce({
      plan_included_seats: 5,
      status: 'PAST_DUE',
      current_period_end: yesterday,
    });
    await expect(service.reserveSeatCeilingForMemberAdd(1)).resolves.toBe(5);
    expect(planService.getFreePlanSeatCeiling).not.toHaveBeenCalled();
  });

  it('reserveSeatCeilingForMemberAdd lapses to the Free-tier ceiling for a dunning sub PAST grace (F4)', async () => {
    // UNPAID, period ended 30 days ago — past the 14-day grace window.
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    vi.mocked(repository.findActiveSeatStateByOrganizationForUpdate).mockResolvedValueOnce({
      plan_included_seats: 25,
      status: 'UNPAID',
      current_period_end: longAgo,
    });
    vi.mocked(planService.getFreePlanSeatCeiling).mockResolvedValue(1);
    await expect(service.reserveSeatCeilingForMemberAdd(1)).resolves.toBe(1);
    expect(planService.getFreePlanSeatCeiling).toHaveBeenCalledTimes(1);
  });

  it('syncSeatQuantityForOrganization pushes max(1, memberCount) to Stripe with a quantity-scoped idempotency key (audit #1)', async () => {
    vi.mocked(repository.findActiveByOrganization).mockResolvedValue(baseRow() as never);
    vi.mocked(membershipSeatUsage.countActiveMembers).mockResolvedValue(4);

    await service.syncSeatQuantityForOrganization({
      organization_public_id: 'org_public',
      idempotencyKey: 'idem-1',
    });

    // The Stripe key is the stable base token scoped by the resolved quantity, so a retry of the
    // SAME job (same quantity) reuses ONE key (Stripe dedups → no duplicate proration).
    expect(paymentProvider.updateSubscriptionQuantity).toHaveBeenCalledWith({
      providerSubscriptionId: 'sub_x',
      quantity: 4,
      idempotencyKey: 'idem-1:qty:4',
    });
    expect(repository.update).toHaveBeenCalledWith('sub_public', 1, { seats: 4 });
  });

  it('clamps zero members to one seat and reuses the quantity key on retry', async () => {
    vi.mocked(repository.findActiveByOrganization).mockResolvedValue(baseRow() as never);
    vi.mocked(membershipSeatUsage.countActiveMembers).mockResolvedValue(0);

    await service.syncSeatQuantityForOrganization({
      organization_public_id: 'org_public',
      idempotencyKey: 'zero-seat-retry',
    });
    await service.syncSeatQuantityForOrganization({
      organization_public_id: 'org_public',
      idempotencyKey: 'zero-seat-retry',
    });

    expect(paymentProvider.updateSubscriptionQuantity).toHaveBeenCalledTimes(2);
    expect(paymentProvider.updateSubscriptionQuantity).toHaveBeenNthCalledWith(1, {
      providerSubscriptionId: 'sub_x',
      quantity: 1,
      idempotencyKey: 'zero-seat-retry:qty:1',
    });
    expect(paymentProvider.updateSubscriptionQuantity).toHaveBeenNthCalledWith(2, {
      providerSubscriptionId: 'sub_x',
      quantity: 1,
      idempotencyKey: 'zero-seat-retry:qty:1',
    });
    expect(repository.update).toHaveBeenCalledTimes(2);
    expect(repository.update).toHaveBeenCalledWith('sub_public', 1, { seats: 1 });
  });

  it('syncSeatQuantityForOrganization derives a DIFFERENT key when the recomputed quantity changes (no Stripe param-mismatch on retry)', async () => {
    vi.mocked(repository.findActiveByOrganization).mockResolvedValue(baseRow() as never);

    vi.mocked(membershipSeatUsage.countActiveMembers).mockResolvedValue(6);
    await service.syncSeatQuantityForOrganization({
      organization_public_id: 'org_public',
      idempotencyKey: 'tok-A',
    });
    vi.mocked(membershipSeatUsage.countActiveMembers).mockResolvedValue(5);
    await service.syncSeatQuantityForOrganization({
      organization_public_id: 'org_public',
      idempotencyKey: 'tok-A',
    });

    expect(paymentProvider.updateSubscriptionQuantity).toHaveBeenNthCalledWith(1, {
      providerSubscriptionId: 'sub_x',
      quantity: 6,
      idempotencyKey: 'tok-A:qty:6',
    });
    expect(paymentProvider.updateSubscriptionQuantity).toHaveBeenNthCalledWith(2, {
      providerSubscriptionId: 'sub_x',
      quantity: 5,
      idempotencyKey: 'tok-A:qty:5',
    });
  });

  it('enqueueSeatQuantitySync stamps a stable per-enqueue token when the hot path passes none (audit #1)', () => {
    service.enqueueSeatQuantitySync({ organization_public_id: 'org_public' });
    const call = vi.mocked(seatSyncMocks.enqueueSubscriptionSeatSyncBestEffort).mock
      .calls[0]![0] as {
      idempotencyKey?: string;
    };
    expect(call.idempotencyKey).toMatch(/^seat-sync:org_public:/);
  });

  it('enqueueSeatQuantitySync namespaces an explicit caller key by organization before Stripe (changePlan path)', () => {
    service.enqueueSeatQuantitySync({
      organization_public_id: 'org_public',
      idempotencyKey: 'client-key-123',
    });
    const call = vi.mocked(seatSyncMocks.enqueueSubscriptionSeatSyncBestEffort).mock
      .calls[0]![0] as {
      idempotencyKey?: string;
    };
    // sec-review: the raw client key must be organization-namespaced so two organizations reusing the same client-key
    // string with the same resulting seat count cannot collide on ONE Stripe idempotency key
    // (`${token}:qty:${n}`) across different subscriptions (Stripe 400 → retries exhaust → no sync).
    expect(call.idempotencyKey).toBe('sub-seat-sync:org_public:client-key-123');
  });

  it('syncSeatQuantityForOrganization is a no-op when there is no active subscription', async () => {
    vi.mocked(repository.findActiveByOrganization).mockResolvedValue(null);
    await service.syncSeatQuantityForOrganization({ organization_public_id: 'org_public' });
    expect(paymentProvider.updateSubscriptionQuantity).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('syncSeatQuantityForOrganization is a no-op for an organization that no longer exists (no retry, no dead letter)', async () => {
    // Deleted between the membership change that enqueued the job and the job itself: permanent, so
    // throwing would only spend the queue's 5 attempts and dead-letter an alert.
    vi.mocked(organizationService.requireOrganizationByPublicId).mockRejectedValue(
      new NotFoundError('Organization'),
    );
    await expect(
      service.syncSeatQuantityForOrganization({ organization_public_id: 'org_public' }),
    ).resolves.toBeUndefined();
    expect(repository.findActiveByOrganization).not.toHaveBeenCalled();
    expect(paymentProvider.updateSubscriptionQuantity).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('syncSeatQuantityForOrganization still throws a non-not-found failure so the job retries', async () => {
    vi.mocked(organizationService.requireOrganizationByPublicId).mockRejectedValue(
      new Error('connection terminated'),
    );
    await expect(
      service.syncSeatQuantityForOrganization({ organization_public_id: 'org_public' }),
    ).rejects.toThrow('connection terminated');
  });

  it('syncSeatQuantityForOrganization reconciles seats locally but skips Stripe for a subscription with no provider id', async () => {
    // A local-only subscription (no provider_subscription_id) must NOT call Stripe — updating a
    // quantity against a null id would throw — yet the local seat count must still be reconciled.
    vi.mocked(repository.findActiveByOrganization).mockResolvedValue(
      baseRow({ provider_subscription_id: null }) as never,
    );
    vi.mocked(membershipSeatUsage.countActiveMembers).mockResolvedValue(4);

    await service.syncSeatQuantityForOrganization({
      organization_public_id: 'org_public',
      idempotencyKey: 'idem-local',
    });

    expect(paymentProvider.updateSubscriptionQuantity).not.toHaveBeenCalled();
    // The ledger is still updated to the recomputed max(1, memberCount).
    expect(repository.update).toHaveBeenCalledWith('sub_public', 1, { seats: 4 });
  });
});
