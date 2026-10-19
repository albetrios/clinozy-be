/**
 * Stripe sandbox catalog: give every paid plan its Stripe product and prices, and record their ids
 * on the plans — so a subscription to a paid plan can be created and paid against the sandbox.
 *
 * Without it every seeded plan has no Stripe price, and `POST /billing/subscriptions` refuses a paid
 * plan (`422 planNotAvailableForBillingCycle`). Free is left as it is: it is the tier an organization
 * with no subscription is on, never one it subscribes to.
 *
 * Sandbox only: refuses any key but a test-mode one. Idempotent: a re-run finds each price by its
 * lookup key and creates nothing; a changed amount gets a new price. Runs after `pnpm db:seed`.
 *
 * Usage:
 *   pnpm db:seed:stripe-catalog             create what is missing and record the ids
 *   pnpm db:seed:stripe-catalog --dry-run   say what it would do; write nothing anywhere
 */
import '@/shared/config/load-env-files.js';
import '@/scripts/seed/seed-runtime-url.js';
import { eq, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { getStripeClient } from '@/infrastructure/payment/stripe.client.js';
import { plans } from '@/domains/billing/sub-domains/plan/plan.schema.js';
import { env } from '@/shared/config/env.config.js';
import { closeDatabase } from './helpers.js';
import { parseCommandLine } from '@tooling/setup/common/script.js';
import {
  assertStripeSandboxKey,
  type CatalogPlan,
  type CatalogPlanUpdate,
  syncStripeCatalog,
} from './stripe-catalog-sync.js';

/** The active plans, as the sync reads them. */
async function readActivePlans(): Promise<CatalogPlan[]> {
  return getRequestDatabase()
    .select({
      publicId: plans.public_id,
      name: plans.name,
      currency: plans.currency,
      priceMonthly: plans.price_monthly,
      priceYearly: plans.price_yearly,
      stripeProductId: plans.stripe_product_id,
      stripePriceMonthlyId: plans.stripe_price_monthly_id,
      stripePriceYearlyId: plans.stripe_price_yearly_id,
    })
    .from(plans)
    .where(eq(plans.is_active, true))
    .orderBy(plans.id);
}

/** Records the synced Stripe ids on their plans, in one transaction. */
async function writePlanUpdates(updates: readonly CatalogPlanUpdate[]): Promise<void> {
  await getRequestDatabase().transaction(async (transaction) => {
    for (const update of updates) {
      await transaction
        .update(plans)
        .set({
          stripe_product_id: update.stripeProductId,
          stripe_price_monthly_id: update.stripePriceMonthlyId,
          stripe_price_yearly_id: update.stripePriceYearlyId,
          updated_at: sql`now()`,
        })
        .where(eq(plans.public_id, update.publicId));
    }
  });
}

async function main(): Promise<void> {
  const dryRun =
    parseCommandLine({ args: process.argv.slice(2), options: { 'dry-run': { type: 'boolean' } } })
      .values['dry-run'] === true;
  assertStripeSandboxKey(env.STRIPE_SECRET_KEY);
  const catalog = await readActivePlans();
  const { updates, outcomes } = await syncStripeCatalog({
    stripe: getStripeClient(),
    plans: catalog,
    dryRun,
  });
  for (const outcome of outcomes) {
    console.log(
      `${outcome.action.padEnd(13)} ${outcome.plan} ${outcome.cycle} (${outcome.lookupKey})${
        outcome.priceId ? ` → ${outcome.priceId}` : ''
      }`,
    );
  }
  const unpriced = catalog.filter(
    (plan) => !outcomes.some((outcome) => outcome.plan === plan.name),
  );
  for (const plan of unpriced) console.log(`no price      ${plan.name} (charges nothing)`);
  if (dryRun) {
    console.log('Dry run: nothing was created or written.');
    return;
  }
  await writePlanUpdates(updates);
  console.log(`${updates.length} plan(s) updated.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
