import { env } from '@/shared/config/env.config.js';
import { NEW_ORGANIZATION_TRIAL_DAYS } from '@/shared/constants/billing.constants.js';
import { MILLISECONDS_PER_DAY } from '@/shared/constants/ttl.constants.js';
import { isPaidPlan } from '@/domains/billing/sub-domains/plan/plan.service.js';
import { isPersonalOrganization } from '@/domains/tenancy/sub-domains/organization/organization-capability.js';
import { INACTIVE_SUBSCRIPTION_STATUSES } from './subscription.repository.js';
import { ACTIVE_PLAN_ACCESS, PLAN_ACCESS_STATE } from './subscription.constants.js';
import type { PlanAccess, PlanAccessSubject } from './subscription.types.js';

/**
 * Dunning subscription statuses — a payment has failed but the subscription has not yet been
 * canceled. The organization keeps its full plan until `current_period_end + BILLING_DUNNING_GRACE_DAYS`
 * (F4), after which its entitlement lapses to the Free tier.
 */
const DUNNING_STATUSES = new Set<string>(['PAST_DUE', 'UNPAID']);

/**
 * Unpaid states that never earned the plan: INCOMPLETE (first payment pending) and PAUSED (trial
 * ended without a payment method). Both hold the Free ceiling until payment lands.
 */
export const UNPAID_ENTITLEMENT_STATUSES: ReadonlySet<string> = new Set<string>([
  'INCOMPLETE',
  'PAUSED',
]);

const TERMINAL_STATUSES: ReadonlySet<string> = new Set<string>(INACTIVE_SUBSCRIPTION_STATUSES);

/**
 * When a subscription's entitlement grace ends: `current_period_end + BILLING_DUNNING_GRACE_DAYS`.
 * A dunning subscription keeps its plan until then (F4); a lapsed paid one keeps writing in the
 * clinic rooms until then (D3).
 */
export function entitlementGraceEndsAt({ currentPeriodEnd }: { currentPeriodEnd: Date }): Date {
  return new Date(
    new Date(currentPeriodEnd).getTime() + env.BILLING_DUNNING_GRACE_DAYS * MILLISECONDS_PER_DAY,
  );
}

/**
 * F4: true when the subscription is in dunning (PAST_DUE / UNPAID) and its grace
 * ({@link entitlementGraceEndsAt}) has passed, so its entitlement has lapsed to the Free tier.
 * ACTIVE / TRIALING and within-grace dunning keep the full plan.
 */
export function isDunningEntitlementLapsed({
  status,
  currentPeriodEnd,
  now,
}: {
  status: string;
  currentPeriodEnd: Date;
  now: Date;
}): boolean {
  if (!DUNNING_STATUSES.has(status)) return false;
  return now.getTime() > entitlementGraceEndsAt({ currentPeriodEnd }).getTime();
}

/**
 * Whether an organization's live subscription row leaves it on the Free-tier seat ceiling: no live
 * subscription, an unpaid one ({@link UNPAID_ENTITLEMENT_STATUSES}) or a dunning one past its grace.
 *
 * @remarks
 * The REQ-4 seat decision `SubscriptionService` makes for the subscription response's `seats_total`
 * and the add-member seat check. `seatState` is the organization's non-terminal row, or `null`.
 */
export function requiresFreeSeatCeiling({
  seatState,
  now,
}: {
  seatState: { status: string; current_period_end: Date } | null;
  now: Date;
}): boolean {
  return (
    !seatState ||
    UNPAID_ENTITLEMENT_STATUSES.has(seatState.status) ||
    isDunningEntitlementLapsed({
      status: seatState.status,
      currentPeriodEnd: seatState.current_period_end,
      now,
    })
  );
}

/**
 * Whether a subscription currently grants a paid plan: ACTIVE or TRIALING on a plan priced above
 * zero, or a dunning subscription (PAST_DUE / UNPAID) still inside its grace.
 *
 * @remarks
 * Built on {@link requiresFreeSeatCeiling} — the same entitlement the seat ceiling enforces — plus
 * {@link isPaidPlan}, since an ACTIVE row on the Free plan is a subscription but no payment. A
 * terminal row (CANCELED, INCOMPLETE_EXPIRED) grants nothing.
 */
export function holdsPaidEntitlement({
  subscription,
  now,
}: {
  subscription: NonNullable<PlanAccessSubject['subscription']>;
  now: Date;
}): boolean {
  if (TERMINAL_STATUSES.has(subscription.status)) return false;
  if (requiresFreeSeatCeiling({ seatState: subscription, now })) return false;
  if (DUNNING_STATUSES.has(subscription.status)) return true;
  return subscription.plan !== null && isPaidPlan({ plan: subscription.plan });
}

/**
 * Decides a clinic's plan access (owner decision D3, 2026-10-17) from its organization and current
 * subscription.
 *
 * @remarks
 * - **Algorithm:** a PERSONAL organization, an organization not found, or one with a paid entitlement
 *   ({@link holdsPaidEntitlement}) is `active`. Any other TEAM organization is unpaid and gets a
 *   grace: a lapsed paid subscription (cancelled, expired, paused, never paid, or dunning past its
 *   period) until {@link entitlementGraceEndsAt}; a clinic that never paid — no subscription, or one
 *   on the Free plan — until `created_at + NEW_ORGANIZATION_TRIAL_DAYS`, a new clinic's trial. Up to
 *   that instant it is `grace`; after it, `read_only`, `graceEndsAt` then being when read-only began.
 * - **Failure modes:** none — pure.
 * - **Notes:** whether read-only is enforced at all (`BILLING_READ_ONLY_ENFORCED`) is the caller's
 *   decision, read before any query (`SubscriptionService.getPlanAccess`).
 */
export function resolvePlanAccess({
  subject,
  now,
}: {
  subject: PlanAccessSubject | null;
  now: Date;
}): PlanAccess {
  if (!subject || isPersonalOrganization(subject.organization)) return ACTIVE_PLAN_ACCESS;
  const { subscription } = subject;
  if (subscription && holdsPaidEntitlement({ subscription, now })) return ACTIVE_PLAN_ACCESS;
  const graceEndsAt =
    subscription?.plan && isPaidPlan({ plan: subscription.plan })
      ? entitlementGraceEndsAt({ currentPeriodEnd: subscription.current_period_end })
      : new Date(
          new Date(subject.organization.created_at).getTime() +
            NEW_ORGANIZATION_TRIAL_DAYS * MILLISECONDS_PER_DAY,
        );
  return {
    state:
      now.getTime() > graceEndsAt.getTime() ? PLAN_ACCESS_STATE.READ_ONLY : PLAN_ACCESS_STATE.GRACE,
    graceEndsAt,
  };
}
