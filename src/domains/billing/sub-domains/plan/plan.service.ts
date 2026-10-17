import { memoizePlanCatalog } from './plan-catalog-memo.js';
import { NotFoundError } from '@/shared/errors/index.js';
import type { PlanRepository } from './plan.repository.js';
import type { PlanFeatures, PlanOutput } from './plan.types.js';
import type { plans } from './plan.schema.js';

/**
 * Internal Drizzle row type for `billing.plans`. Used inside services and the
 * payment provider where numeric IDs and Stripe price IDs are needed.
 *
 * @remarks
 * - **Algorithm:** Inferred directly from {@link plans} `$inferSelect`.
 * - **Failure modes:** None — type alias only.
 * - **Side effects:** None.
 * - **Notes:** Distinct from {@link PlanOutput}, which is the public API shape
 *   that omits internal IDs and Stripe identifiers.
 */
export type PlanRecord = typeof plans.$inferSelect;

/**
 * Read-only access to the global plan catalog.
 *
 * @remarks
 * - **Algorithm:** Thin wrapper around {@link PlanRepository} that maps rows to
 *   {@link PlanOutput} for the public API and exposes `requirePlan*` helpers
 *   for other services that need the raw {@link PlanRecord} (e.g. subscription
 *   creation and Stripe price lookup).
 * - **Failure modes:** Throws {@link NotFoundError} when a requested plan does
 *   not exist; never mutates data (catalog is managed offline).
 * - **Side effects:** None — pure reads.
 * - **Notes:** Plans are a system-wide table, so no organization context is
 *   required and results are safe to cache via the catalog cache headers
 *   applied by the controller.
 */
export class PlanService {
  constructor(private readonly repository: PlanRepository) {}

  async requireActivePlanByPublicId(public_id: string): Promise<PlanRecord> {
    const row = await this.repository.findByPublicId(public_id);
    if (!row?.is_active) throw new NotFoundError('Plan');
    return row;
  }

  async requirePlanRecordByPublicId(public_id: string): Promise<PlanRecord> {
    const row = await this.repository.findByPublicId(public_id);
    if (!row) throw new NotFoundError('Plan');
    return row;
  }

  async requirePlanRecordByInternalId(identifier: number): Promise<PlanRecord> {
    const row = await this.repository.findById(identifier);
    if (!row) throw new NotFoundError('Plan');
    return row;
  }

  /**
   * Resolves the Free-tier seat ceiling (the cheapest active plan's `included_seats`).
   *
   * @remarks
   * - **Algorithm:** delegates to {@link PlanRepository.findFreePlanSeatCeiling}.
   * - **Notes:** used by `SubscriptionService.reserveSeatCeilingForMemberAdd` as the entitlement
   *   floor for organizations with no active subscription or a dunning subscription past grace.
   *   Returns `null` when no active plan exists or the entry tier grants unlimited seats.
   */
  async getFreePlanSeatCeiling(): Promise<number | null> {
    return this.repository.findFreePlanSeatCeiling();
  }

  /**
   * The public catalog read, served from a one-minute in-process memo.
   *
   * @remarks
   * - **Algorithm:** {@link memoizePlanCatalog} answers from memory, or runs the query once and
   *   memoizes the serialized output; concurrent misses share one query.
   * - **Failure modes:** a query failure propagates and is not memoized.
   * - **Side effects:** module-level memo state.
   * - **Notes:** only this method is memoized. Every plan read that makes a DECISION — the seat
   *   ceiling (`getFreePlanSeatCeiling`), subscription create and change-plan
   *   (`requireActivePlanByPublicId`), the Stripe price lookup — goes through a different
   *   repository method and still reads Postgres. That separation is structural, not a
   *   convention: those methods return the record, this one returns the public output shape.
   */
  async list(): Promise<PlanOutput[]> {
    return memoizePlanCatalog(async () => {
      const rows = await this.repository.findAllActive();
      return rows.map(toOutput);
    });
  }

  async getByPublicId(public_id: string): Promise<PlanOutput> {
    const row = await this.repository.findByPublicId(public_id);
    // route-#7: this backs the PUBLIC GET /billing/plans/:plan_id. An inactive (retired/draft) plan is
    // not part of the public catalog — the list endpoint hides it, so the detail endpoint must 404
    // it too rather than leaking its name + monthly/yearly pricing to anonymous callers.
    if (!row?.is_active) throw new NotFoundError('Plan');
    return toOutput(row);
  }
}

/**
 * Whether `plan` costs money — a price above zero on either cycle. A plan priced zero on both is the
 * Free plan.
 *
 * @remarks
 * The one definition of "paid plan": annual billing ({@link supportsPlanBillingCycle}) and a clinic's
 * paid entitlement (`holdsPaidEntitlement` in the subscription sub-domain) both read it. Catalog
 * prices are never negative (`chk_plans_price_m` / `chk_plans_price_y`).
 */
export function isPaidPlan(input: {
  plan: { price_monthly: string; price_yearly: string };
}): boolean {
  return Number(input.plan.price_monthly) > 0 || Number(input.plan.price_yearly) > 0;
}

/**
 * Free plans renew monthly; paid plans may be purchased monthly or annually.
 * Missing provider configuration is separate from product cycle availability.
 *
 * @remarks
 * Monthly billing is available for every plan. Annual billing is unavailable only
 * when both catalog prices are zero ({@link isPaidPlan}), so Free has no annual zero-price offer.
 * This pure policy is shared by catalog serialization and subscription validation;
 * it does not inspect provider price mappings or perform any external mutation.
 */
export function supportsPlanBillingCycle(input: {
  plan: { price_monthly: string; price_yearly: string };
  billingCycle: 'monthly' | 'yearly';
}): boolean {
  return input.billingCycle === 'monthly' || isPaidPlan({ plan: input.plan });
}

function toOutput(row: {
  public_id: string;
  name: string;
  description: string | null;
  price_monthly: string;
  price_yearly: string;
  currency: string;
  is_active: boolean;
  // REQ-4: `features` is the typed jsonb map (NOT NULL, default `{}`) and `included_seats`
  // drives the structured `limits.seats` (null = unlimited).
  features: PlanFeatures;
  included_seats: number | null;
  created_at: Date;
  updated_at: Date;
}): PlanOutput {
  return {
    id: row.public_id,
    name: row.name,
    description: row.description,
    price_monthly: String(row.price_monthly),
    price_yearly: supportsPlanBillingCycle({ plan: row, billingCycle: 'yearly' })
      ? String(row.price_yearly)
      : null,
    billing_cycles: supportsPlanBillingCycle({ plan: row, billingCycle: 'yearly' })
      ? ['monthly', 'yearly']
      : ['monthly'],
    currency: row.currency,
    is_active: row.is_active,
    features: row.features,
    limits: { seats: row.included_seats ?? null },
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
