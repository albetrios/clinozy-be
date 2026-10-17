/** MVCC token and provider watermark used to guard an authoritative same-second reconciliation. */
export interface StripeSubscriptionOrderingState {
  version: string;
  watermark: Date | null;
  status: string;
}

/**
 * The subscription fields a Stripe sync can change that the public JSON shows — compared before and
 * after a sync so an event is emitted only when a customer-visible field moved.
 */
export interface SubscriptionPublicState {
  status: string;
  cancel_at_period_end: boolean;
  canceled_at: Date | null;
  current_period_start: Date;
  current_period_end: Date;
  plan_id: number;
}

/** Repository-level input for {@link SubscriptionRepository.create} — already-resolved numeric IDs. */
export interface SubscriptionCreateData {
  organization_id: number;
  plan_id: number;
  billing_cycle: string;
  status?: string;
  current_period_start: Date;
  current_period_end: Date;
  trial_end?: Date;
  /**
   * Set only by the Stripe `customer.subscription.deleted` tombstone path
   * (audit-#1) when materialising a CANCELED row whose local subscription never
   * existed. The regular create paths leave this unset (defaults to `NULL`).
   */
  /** `null` clears it (a resumed subscription). */
  canceled_at?: Date | null;
  /**
   * Set alongside {@link canceled_at} on the deletion tombstone path so the
   * CANCELED row is unambiguously terminal. Defaults to `false` for every other
   * create path.
   */
  cancel_at_period_end?: boolean;
  created_by_user_id?: number;
  provider?: string;
  provider_subscription_id?: string;
  provider_customer_id?: string;
  /**
   * Initial watermark for the Stripe-event reconciliation guard. Set to `new Date()`
   * by the HTTP `create()` path when Stripe accepted the subscription (sec-B2) so a
   * late-arriving `customer.subscription.created` whose `created` timestamp is older
   * than this value cannot clobber the row. Unset when Stripe is not configured.
   */
  last_stripe_event_created_at?: Date;
}

/**
 * Partial update set for {@link SubscriptionRepository.update} and the
 * webhook-driven sync paths; all fields are optional so callers can apply
 * narrow patches.
 */
export interface SubscriptionUpdateData {
  cancel_at_period_end?: boolean;
  status?: string;
  /** `null` clears it (a resumed subscription). */
  canceled_at?: Date | null;
  current_period_start?: Date;
  current_period_end?: Date;
  plan_id?: number;
  billing_cycle?: string;
  /**
   * REQ-4: purchased seat quantity, written by the Stripe webhook reconcile path from the
   * subscription item's `quantity`. Left unset by every other update path so a partial patch
   * never clobbers the seat count.
   */
  seats?: number;
  updated_at?: Date;
  /**
   * Set by HTTP-side mutations (`cancel`/`resume`/`changePlan`) to `new Date()` so a
   * stale Stripe event delivered later cannot regress the row state (sec-B3). The
   * webhook-driven `syncFromStripeProviderSubscription` path sets this from the event's
   * own `created` timestamp instead — both write through the same column but only the
   * HTTP path uses the current wall clock.
   */
  last_stripe_event_created_at?: Date;
}

/**
 * A clinic's plan access (owner decision D3, 2026-10-17): `active` with a paid entitlement (or while
 * `BILLING_READ_ONLY_ENFORCED` is off, and always for a PERSONAL organization), `grace` while an
 * unpaid clinic's grace runs, `read_only` once it has ended — every write under `/api/v1/app/` is then
 * refused.
 */
export type PlanAccessState = 'active' | 'grace' | 'read_only';

/** A clinic's plan access as the service decides it — produced by `resolvePlanAccess`. */
export interface PlanAccess {
  state: PlanAccessState;
  /** When the grace ends (`grace`) or ended, i.e. when read-only began (`read_only`); `null` when `active`. */
  graceEndsAt: Date | null;
}

/** Public `plan_access` body — `active_organization.plan_access` on `GET /auth/me/context`. */
export interface PlanAccessOutput {
  state: PlanAccessState;
  /** ISO 8601 timestamp; `null` when `state` is `active`. */
  grace_ends_at: string | null;
}

/**
 * What a clinic's plan access is decided from — read by
 * `SubscriptionRepository.findPlanAccessSubject` in one query.
 */
export interface PlanAccessSubject {
  organization: { type: string; created_at: Date };
  /**
   * The organization's current subscription: its live (non-terminal) row when it has one, else its
   * most recent; `null` when it never had one.
   */
  subscription: {
    status: string;
    current_period_end: Date;
    /** The subscription plan's prices; `null` only when the plan row is gone. */
    plan: { price_monthly: string; price_yearly: string } | null;
  } | null;
}
