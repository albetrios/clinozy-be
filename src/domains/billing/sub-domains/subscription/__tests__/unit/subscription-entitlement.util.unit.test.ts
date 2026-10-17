import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '@/shared/config/env.config.js';
import { NEW_ORGANIZATION_TRIAL_DAYS } from '@/shared/constants/billing.constants.js';
import {
  holdsPaidEntitlement,
  isDunningEntitlementLapsed,
  requiresFreeSeatCeiling,
  resolvePlanAccess,
} from '@/domains/billing/sub-domains/subscription/subscription-entitlement.util.js';
import type { PlanAccessSubject } from '@/domains/billing/sub-domains/subscription/subscription.types.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-17T10:00:00.000Z');
const LAPSE_GRACE_DAYS = 14;

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY);
const daysAfter = (base: Date, days: number): Date => new Date(base.getTime() + days * DAY);

const PAID_PLAN = { price_monthly: '1999.00', price_yearly: '19990.00' };
const FREE_PLAN = { price_monthly: '0.00', price_yearly: '0.00' };

function clinic(options: {
  createdDaysAgo: number;
  type?: 'TEAM' | 'PERSONAL';
  subscription?: PlanAccessSubject['subscription'];
}): PlanAccessSubject {
  return {
    organization: { type: options.type ?? 'TEAM', created_at: daysAgo(options.createdDaysAgo) },
    subscription: options.subscription ?? null,
  };
}

function subscription(options: {
  status: string;
  periodEndDaysAgo: number;
  plan?: { price_monthly: string; price_yearly: string } | null;
}): NonNullable<PlanAccessSubject['subscription']> {
  return {
    status: options.status,
    current_period_end: daysAgo(options.periodEndDaysAgo),
    plan: options.plan === undefined ? PAID_PLAN : options.plan,
  };
}

/**
 * Read-only mode for unpaid clinics (owner decision D3, 2026-10-17): a TEAM organization with a paid
 * entitlement is `active`; an unpaid one gets 14 days of grace — from its `created_at` when it never
 * paid, from the lapsed subscription's `current_period_end` otherwise — then turns `read_only`.
 */
describe('resolvePlanAccess (owner decision D3)', () => {
  const originalLapseGrace = env.BILLING_DUNNING_GRACE_DAYS;
  beforeAll(() => {
    env.BILLING_DUNNING_GRACE_DAYS = LAPSE_GRACE_DAYS;
  });
  afterAll(() => {
    env.BILLING_DUNNING_GRACE_DAYS = originalLapseGrace;
  });

  it('a new clinic with no subscription is in its trial grace, ending 14 days after created_at', () => {
    const subject = clinic({ createdDaysAgo: 3 });
    expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
      state: 'grace',
      graceEndsAt: daysAfter(daysAgo(3), NEW_ORGANIZATION_TRIAL_DAYS),
    });
  });

  it('an old clinic with no subscription is read-only since its trial ended', () => {
    const subject = clinic({ createdDaysAgo: 40 });
    expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
      state: 'read_only',
      graceEndsAt: daysAfter(daysAgo(40), NEW_ORGANIZATION_TRIAL_DAYS),
    });
  });

  it('is still grace at the very instant the grace ends, read-only just after', () => {
    const subject = clinic({ createdDaysAgo: NEW_ORGANIZATION_TRIAL_DAYS });
    expect(resolvePlanAccess({ subject, now: NOW }).state).toBe('grace');
    expect(resolvePlanAccess({ subject, now: new Date(NOW.getTime() + 1) }).state).toBe(
      'read_only',
    );
  });

  it.each(['ACTIVE', 'TRIALING'])(
    '%s on a paid plan is active, however old the clinic',
    (status) => {
      const subject = clinic({
        createdDaysAgo: 400,
        subscription: subscription({ status, periodEndDaysAgo: -20 }),
      });
      expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
        state: 'active',
        graceEndsAt: null,
      });
    },
  );

  it('the Free plan is no paid entitlement: a new clinic on it is in its trial grace', () => {
    const subject = clinic({
      createdDaysAgo: 5,
      subscription: subscription({ status: 'ACTIVE', periodEndDaysAgo: -25, plan: FREE_PLAN }),
    });
    expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
      state: 'grace',
      graceEndsAt: daysAfter(daysAgo(5), NEW_ORGANIZATION_TRIAL_DAYS),
    });
  });

  it('the Free plan is no paid entitlement: an old clinic on it is read-only (trial from created_at)', () => {
    const subject = clinic({
      createdDaysAgo: 90,
      subscription: subscription({ status: 'ACTIVE', periodEndDaysAgo: -25, plan: FREE_PLAN }),
    });
    expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
      state: 'read_only',
      graceEndsAt: daysAfter(daysAgo(90), NEW_ORGANIZATION_TRIAL_DAYS),
    });
  });

  it.each(['PAST_DUE', 'UNPAID'])(
    '%s within its dunning grace keeps the paid entitlement (active)',
    (status) => {
      const subject = clinic({
        createdDaysAgo: 200,
        subscription: subscription({ status, periodEndDaysAgo: LAPSE_GRACE_DAYS - 1 }),
      });
      expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
        state: 'active',
        graceEndsAt: null,
      });
    },
  );

  it.each(['PAST_DUE', 'UNPAID'])(
    '%s past its dunning grace is read-only since period end + 14 days',
    (status) => {
      const subject = clinic({
        createdDaysAgo: 200,
        subscription: subscription({ status, periodEndDaysAgo: LAPSE_GRACE_DAYS + 1 }),
      });
      expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
        state: 'read_only',
        graceEndsAt: daysAfter(daysAgo(LAPSE_GRACE_DAYS + 1), LAPSE_GRACE_DAYS),
      });
    },
  );

  it('CANCELED within 14 days of its period end is in grace until period end + 14 days', () => {
    const subject = clinic({
      createdDaysAgo: 200,
      subscription: subscription({ status: 'CANCELED', periodEndDaysAgo: 4 }),
    });
    expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
      state: 'grace',
      graceEndsAt: daysAfter(daysAgo(4), LAPSE_GRACE_DAYS),
    });
  });

  it('CANCELED more than 14 days after its period end is read-only', () => {
    const subject = clinic({
      createdDaysAgo: 200,
      subscription: subscription({ status: 'CANCELED', periodEndDaysAgo: 30 }),
    });
    expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
      state: 'read_only',
      graceEndsAt: daysAfter(daysAgo(30), LAPSE_GRACE_DAYS),
    });
  });

  it.each(['INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAUSED'])(
    '%s on a paid plan is unpaid: grace runs from its period end',
    (status) => {
      const subject = clinic({
        createdDaysAgo: 200,
        subscription: subscription({ status, periodEndDaysAgo: 2 }),
      });
      expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
        state: 'grace',
        graceEndsAt: daysAfter(daysAgo(2), LAPSE_GRACE_DAYS),
      });
    },
  );

  it('a PERSONAL organization is never read-only', () => {
    const subject = clinic({ createdDaysAgo: 400, type: 'PERSONAL' });
    expect(resolvePlanAccess({ subject, now: NOW })).toEqual({
      state: 'active',
      graceEndsAt: null,
    });
  });

  it('an organization not found reads active (the route answers for it)', () => {
    expect(resolvePlanAccess({ subject: null, now: NOW })).toEqual({
      state: 'active',
      graceEndsAt: null,
    });
  });
});

describe('subscription entitlement helpers', () => {
  const originalLapseGrace = env.BILLING_DUNNING_GRACE_DAYS;
  beforeAll(() => {
    env.BILLING_DUNNING_GRACE_DAYS = LAPSE_GRACE_DAYS;
  });
  afterAll(() => {
    env.BILLING_DUNNING_GRACE_DAYS = originalLapseGrace;
  });

  it('isDunningEntitlementLapsed: only a dunning status past period end + grace', () => {
    const lapsedEnd = daysAgo(LAPSE_GRACE_DAYS + 1);
    const withinEnd = daysAgo(LAPSE_GRACE_DAYS - 1);
    expect(
      isDunningEntitlementLapsed({ status: 'PAST_DUE', currentPeriodEnd: lapsedEnd, now: NOW }),
    ).toBe(true);
    expect(
      isDunningEntitlementLapsed({ status: 'UNPAID', currentPeriodEnd: withinEnd, now: NOW }),
    ).toBe(false);
    expect(
      isDunningEntitlementLapsed({ status: 'ACTIVE', currentPeriodEnd: lapsedEnd, now: NOW }),
    ).toBe(false);
  });

  it('requiresFreeSeatCeiling: no row, an unpaid status or a lapsed dunning one', () => {
    expect(requiresFreeSeatCeiling({ seatState: null, now: NOW })).toBe(true);
    for (const status of ['INCOMPLETE', 'PAUSED']) {
      expect(
        requiresFreeSeatCeiling({
          seatState: { status, current_period_end: daysAgo(-10) },
          now: NOW,
        }),
      ).toBe(true);
    }
    expect(
      requiresFreeSeatCeiling({
        seatState: { status: 'PAST_DUE', current_period_end: daysAgo(LAPSE_GRACE_DAYS + 1) },
        now: NOW,
      }),
    ).toBe(true);
    expect(
      requiresFreeSeatCeiling({
        seatState: { status: 'ACTIVE', current_period_end: daysAgo(-10) },
        now: NOW,
      }),
    ).toBe(false);
  });

  it('holdsPaidEntitlement: a terminal row or a missing plan grants nothing', () => {
    expect(
      holdsPaidEntitlement({
        subscription: subscription({ status: 'CANCELED', periodEndDaysAgo: -10 }),
        now: NOW,
      }),
    ).toBe(false);
    expect(
      holdsPaidEntitlement({
        subscription: subscription({ status: 'ACTIVE', periodEndDaysAgo: -10, plan: null }),
        now: NOW,
      }),
    ).toBe(false);
    expect(
      holdsPaidEntitlement({
        subscription: subscription({ status: 'ACTIVE', periodEndDaysAgo: -10 }),
        now: NOW,
      }),
    ).toBe(true);
  });
});
