/**
 * The Stripe sandbox catalog sync behind `pnpm db:seed:stripe-catalog`: gives each paid plan the
 * Stripe product and the monthly and yearly prices its amounts call for, so a subscription to it
 * can be created and paid against a Stripe sandbox. The Stripe client is a parameter, so the sync
 * runs against a fake in its unit test.
 */
import type Stripe from 'stripe';
import { PROJECT_SLUG } from '@/shared/constants/project-identity.constants.js';

/** A billing cycle a plan can be priced on. */
export type CatalogBillingCycle = 'monthly' | 'yearly';

/** Stripe's recurring interval for each billing cycle. */
const CYCLE_INTERVAL: Readonly<Record<CatalogBillingCycle, 'month' | 'year'>> = {
  monthly: 'month',
  yearly: 'year',
};

/** A plan as the sync reads it from `billing.plans`. */
export interface CatalogPlan {
  publicId: string;
  name: string;
  currency: string;
  priceMonthly: string;
  priceYearly: string;
  stripeProductId: string | null;
  stripePriceMonthlyId: string | null;
  stripePriceYearlyId: string | null;
}

/** The Stripe ids the sync writes back onto a plan. */
export interface CatalogPlanUpdate {
  publicId: string;
  stripeProductId: string | null;
  stripePriceMonthlyId: string | null;
  stripePriceYearlyId: string | null;
}

/** What the sync did — or, in a dry run, would do — for one plan's cycle. */
export interface CatalogPriceOutcome {
  plan: string;
  cycle: CatalogBillingCycle;
  lookupKey: string;
  action: 'kept' | 'created' | 'replaced' | 'would-create' | 'would-replace';
  priceId: string | null;
}

/** The Stripe calls the sync makes — the slice of the SDK client it needs. */
export interface CatalogStripeClient {
  prices: Pick<Stripe.PriceResource, 'list' | 'create'>;
  products: Pick<Stripe.ProductResource, 'create'>;
}

/**
 * Refuses any key but a Stripe sandbox one (`sk_test_…` or `rk_test_…`).
 *
 * @remarks
 * - **Notes:** the sync creates products and prices; pointed at a live account it would publish
 *   them, so it is a sandbox tool only. A live catalog is set up and reviewed by hand.
 * - **Failure modes:** throws when the key is missing or is not a test-mode key.
 */
export function assertStripeSandboxKey(secretKey: string | undefined): void {
  if (!(secretKey && /^(?:sk|rk)_test_/.test(secretKey))) {
    throw new Error(
      'db:seed:stripe-catalog runs against a Stripe sandbox only: STRIPE_SECRET_KEY must be a test-mode key (sk_test_ or rk_test_).',
    );
  }
}

/**
 * The lookup key of a plan's price on a cycle (`<project slug>:plan:starter:monthly`): how a
 * re-run finds the price it made instead of making another.
 */
export function catalogLookupKey({
  planName,
  cycle,
}: {
  planName: string;
  cycle: CatalogBillingCycle;
}): string {
  const slug = planName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
  return `${PROJECT_SLUG}:plan:${slug}:${cycle}`;
}

/** A plan's amount on a cycle in the currency's minor unit (cents): `'10.00'` → `1000`. */
export function catalogMinorAmount({
  plan,
  cycle,
}: {
  plan: CatalogPlan;
  cycle: CatalogBillingCycle;
}): number {
  return Math.round(Number(cycle === 'monthly' ? plan.priceMonthly : plan.priceYearly) * 100);
}

/** The cycles a plan is charged on — those with an amount above zero (Free has none). */
export function catalogBilledCycles(plan: CatalogPlan): CatalogBillingCycle[] {
  return (['monthly', 'yearly'] as const).filter(
    (cycle) => catalogMinorAmount({ plan, cycle }) > 0,
  );
}

/** Whether a Stripe price charges what the plan asks on that cycle. */
function priceMatches({
  price,
  plan,
  cycle,
}: {
  price: Stripe.Price;
  plan: CatalogPlan;
  cycle: CatalogBillingCycle;
}): boolean {
  return (
    price.unit_amount === catalogMinorAmount({ plan, cycle }) &&
    price.currency === plan.currency.toLowerCase() &&
    price.recurring?.interval === CYCLE_INTERVAL[cycle]
  );
}

/** The id of the product a price belongs to. */
function productIdOf(price: Stripe.Price): string {
  return typeof price.product === 'string' ? price.product : price.product.id;
}

/**
 * Syncs one plan: keeps each price that already charges the plan's amount, and creates the
 * rest (moving the lookup key onto a replacement when the amount changed).
 */
async function syncPlan({
  stripe,
  plan,
  dryRun,
}: {
  stripe: CatalogStripeClient;
  plan: CatalogPlan;
  dryRun: boolean;
}): Promise<{ update: CatalogPlanUpdate; outcomes: CatalogPriceOutcome[] }> {
  const cycles = catalogBilledCycles(plan);
  const lookupKeys = cycles.map((cycle) => catalogLookupKey({ planName: plan.name, cycle }));
  const found = new Map<string, Stripe.Price>();
  if (lookupKeys.length > 0) {
    const listed = await stripe.prices.list({
      lookup_keys: lookupKeys,
      active: true,
      limit: lookupKeys.length,
    });
    for (const price of listed.data) {
      if (price.lookup_key) found.set(price.lookup_key, price);
    }
  }

  let productId =
    plan.stripeProductId ?? [...found.values()].map(productIdOf).find(Boolean) ?? null;
  const priceIds: Record<CatalogBillingCycle, string | null> = { monthly: null, yearly: null };
  const outcomes: CatalogPriceOutcome[] = [];

  for (const cycle of cycles) {
    const lookupKey = catalogLookupKey({ planName: plan.name, cycle });
    const existing = found.get(lookupKey);
    if (existing && priceMatches({ price: existing, plan, cycle })) {
      priceIds[cycle] = existing.id;
      outcomes.push({ plan: plan.name, cycle, lookupKey, action: 'kept', priceId: existing.id });
      continue;
    }
    if (dryRun) {
      outcomes.push({
        plan: plan.name,
        cycle,
        lookupKey,
        action: existing ? 'would-replace' : 'would-create',
        priceId: null,
      });
      continue;
    }
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        metadata: { source: PROJECT_SLUG, plan_id: plan.publicId },
      });
      productId = product.id;
    }
    const created = await stripe.prices.create({
      product: productId,
      currency: plan.currency.toLowerCase(),
      unit_amount: catalogMinorAmount({ plan, cycle }),
      recurring: { interval: CYCLE_INTERVAL[cycle] },
      lookup_key: lookupKey,
      // A changed amount gets a new price; the key moves to it, so the next run keeps it.
      transfer_lookup_key: existing !== undefined,
      nickname: `${plan.name} ${cycle}`,
      metadata: { source: PROJECT_SLUG, plan_id: plan.publicId },
    });
    priceIds[cycle] = created.id;
    outcomes.push({
      plan: plan.name,
      cycle,
      lookupKey,
      action: existing ? 'replaced' : 'created',
      priceId: created.id,
    });
  }

  return {
    update: {
      publicId: plan.publicId,
      stripeProductId: productId,
      stripePriceMonthlyId: priceIds.monthly,
      stripePriceYearlyId: priceIds.yearly,
    },
    outcomes,
  };
}

/**
 * Syncs the plan catalog with the Stripe sandbox and returns the plans whose Stripe ids changed.
 *
 * @remarks
 * - **Algorithm:** for each plan, the prices it is charged on (amount above zero) are looked up
 *   by {@link catalogLookupKey}; one that charges the plan's amount, currency and interval is
 *   kept, any other is created on the plan's product (made once, when the plan has none). A plan
 *   with no charged cycle — Free — is left without prices: it is the tier an organization with no
 *   subscription is on, never one it subscribes to.
 * - **Side effects:** creates Stripe products and prices unless `dryRun`; never writes Postgres —
 *   the caller writes the returned updates.
 * - **Notes:** idempotent: a second run keeps every price and returns no updates.
 */
export async function syncStripeCatalog({
  stripe,
  plans,
  dryRun = false,
}: {
  stripe: CatalogStripeClient;
  plans: readonly CatalogPlan[];
  dryRun?: boolean;
}): Promise<{ updates: CatalogPlanUpdate[]; outcomes: CatalogPriceOutcome[] }> {
  const updates: CatalogPlanUpdate[] = [];
  const outcomes: CatalogPriceOutcome[] = [];
  for (const plan of plans) {
    const synced = await syncPlan({ stripe, plan, dryRun });
    outcomes.push(...synced.outcomes);
    if (dryRun || synced.outcomes.length === 0) continue;
    const { update } = synced;
    const changed =
      update.stripeProductId !== plan.stripeProductId ||
      update.stripePriceMonthlyId !== plan.stripePriceMonthlyId ||
      update.stripePriceYearlyId !== plan.stripePriceYearlyId;
    if (changed) updates.push(update);
  }
  return { updates, outcomes };
}
