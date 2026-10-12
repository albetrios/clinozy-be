import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  assertStripeSandboxKey,
  type CatalogPlan,
  type CatalogStripeClient,
  catalogBilledCycles,
  catalogLookupKey,
  syncStripeCatalog,
} from '@/scripts/seed/stripe-catalog-sync.js';
import { PROJECT_SLUG } from '@/shared/constants/project-identity.constants.js';

/** An in-memory Stripe sandbox: the products and prices the sync makes, findable by lookup key. */
function fakeStripe() {
  const products: Array<{ id: string; name: string }> = [];
  const prices: Stripe.Price[] = [];
  const client: CatalogStripeClient = {
    products: {
      create: (async (params: Stripe.ProductCreateParams) => {
        const product = { id: `prod_${products.length + 1}`, name: params.name };
        products.push(product);
        return product;
      }) as unknown as CatalogStripeClient['products']['create'],
    },
    prices: {
      list: (async (params: Stripe.PriceListParams) => ({
        data: prices.filter(
          (price) =>
            price.active &&
            price.lookup_key !== null &&
            (params.lookup_keys ?? []).includes(price.lookup_key),
        ),
      })) as unknown as CatalogStripeClient['prices']['list'],
      create: (async (params: Stripe.PriceCreateParams) => {
        if (params.transfer_lookup_key) {
          for (const price of prices) {
            if (price.lookup_key === params.lookup_key) price.lookup_key = null;
          }
        }
        const price = {
          id: `price_${prices.length + 1}`,
          active: true,
          product: params.product,
          currency: params.currency,
          unit_amount: params.unit_amount,
          recurring: { interval: params.recurring?.interval },
          lookup_key: params.lookup_key ?? null,
        } as unknown as Stripe.Price;
        prices.push(price);
        return price;
      }) as unknown as CatalogStripeClient['prices']['create'],
    },
  };
  return { client, products, prices };
}

function plan(overrides: Partial<CatalogPlan> & Pick<CatalogPlan, 'name'>): CatalogPlan {
  return {
    publicId: `plan_${overrides.name.toLowerCase()}`,
    currency: 'USD',
    priceMonthly: '0.00',
    priceYearly: '0.00',
    stripeProductId: null,
    stripePriceMonthlyId: null,
    stripePriceYearlyId: null,
    ...overrides,
  };
}

const FREE = plan({ name: 'Free' });
const STARTER = plan({ name: 'Starter', priceMonthly: '10.00', priceYearly: '100.00' });

/** The plans as they read after the updates were written. */
function applied(
  plans: readonly CatalogPlan[],
  updates: Awaited<ReturnType<typeof syncStripeCatalog>>['updates'],
): CatalogPlan[] {
  return plans.map((row) => {
    const update = updates.find((candidate) => candidate.publicId === row.publicId);
    return update ? { ...row, ...update } : row;
  });
}

describe('Stripe sandbox catalog sync', () => {
  it('refuses anything but a test-mode key', () => {
    expect(() => assertStripeSandboxKey(undefined)).toThrow(/sandbox only/);
    expect(() => assertStripeSandboxKey('sk_live_abc')).toThrow(/sandbox only/);
    expect(() => assertStripeSandboxKey('rk_live_abc')).toThrow(/sandbox only/);
    expect(() => assertStripeSandboxKey('sk_test_abc')).not.toThrow();
    expect(() => assertStripeSandboxKey('rk_test_abc')).not.toThrow();
  });

  it('names a price by the project, the plan and the cycle', () => {
    expect(catalogLookupKey({ planName: 'Starter', cycle: 'monthly' })).toBe(
      `${PROJECT_SLUG}:plan:starter:monthly`,
    );
    expect(catalogLookupKey({ planName: 'Growth Plus!', cycle: 'yearly' })).toBe(
      `${PROJECT_SLUG}:plan:growth-plus:yearly`,
    );
  });

  it('charges only the cycles with an amount — Free has none', () => {
    expect(catalogBilledCycles(FREE)).toEqual([]);
    expect(catalogBilledCycles(STARTER)).toEqual(['monthly', 'yearly']);
    expect(catalogBilledCycles(plan({ name: 'Monthly only', priceMonthly: '5.00' }))).toEqual([
      'monthly',
    ]);
  });

  it('creates one product and a monthly and a yearly price for a paid plan, and leaves Free', async () => {
    const stripe = fakeStripe();
    const { updates, outcomes } = await syncStripeCatalog({
      stripe: stripe.client,
      plans: [FREE, STARTER],
    });

    expect(stripe.products).toEqual([{ id: 'prod_1', name: 'Starter' }]);
    expect(
      stripe.prices.map((price) => [
        price.lookup_key,
        price.unit_amount,
        price.currency,
        price.recurring?.interval,
      ]),
    ).toEqual([
      [`${PROJECT_SLUG}:plan:starter:monthly`, 1000, 'usd', 'month'],
      [`${PROJECT_SLUG}:plan:starter:yearly`, 10000, 'usd', 'year'],
    ]);
    expect(updates).toEqual([
      {
        publicId: 'plan_starter',
        stripeProductId: 'prod_1',
        stripePriceMonthlyId: 'price_1',
        stripePriceYearlyId: 'price_2',
      },
    ]);
    expect(outcomes.map((outcome) => outcome.action)).toEqual(['created', 'created']);
  });

  it('creates nothing on a second run', async () => {
    const stripe = fakeStripe();
    const first = await syncStripeCatalog({ stripe: stripe.client, plans: [FREE, STARTER] });
    const second = await syncStripeCatalog({
      stripe: stripe.client,
      plans: applied([FREE, STARTER], first.updates),
    });

    expect(second.updates).toEqual([]);
    expect(second.outcomes.map((outcome) => outcome.action)).toEqual(['kept', 'kept']);
    expect(stripe.prices).toHaveLength(2);
    expect(stripe.products).toHaveLength(1);
  });

  it('finds its prices again when the plan lost their ids (a re-seeded database)', async () => {
    const stripe = fakeStripe();
    await syncStripeCatalog({ stripe: stripe.client, plans: [STARTER] });
    const { updates } = await syncStripeCatalog({ stripe: stripe.client, plans: [STARTER] });

    expect(updates).toEqual([
      {
        publicId: 'plan_starter',
        stripeProductId: 'prod_1',
        stripePriceMonthlyId: 'price_1',
        stripePriceYearlyId: 'price_2',
      },
    ]);
    expect(stripe.prices).toHaveLength(2);
  });

  it('gives a changed amount a new price on the same product, and moves the key to it', async () => {
    const stripe = fakeStripe();
    const first = await syncStripeCatalog({ stripe: stripe.client, plans: [STARTER] });
    const raised = { ...applied([STARTER], first.updates)[0]!, priceMonthly: '12.00' };
    const { updates, outcomes } = await syncStripeCatalog({
      stripe: stripe.client,
      plans: [raised],
    });

    expect(outcomes.map((outcome) => [outcome.cycle, outcome.action])).toEqual([
      ['monthly', 'replaced'],
      ['yearly', 'kept'],
    ]);
    expect(updates).toEqual([
      {
        publicId: 'plan_starter',
        stripeProductId: 'prod_1',
        stripePriceMonthlyId: 'price_3',
        stripePriceYearlyId: 'price_2',
      },
    ]);
    expect(stripe.prices.find((price) => price.id === 'price_1')?.lookup_key).toBeNull();
    expect(stripe.prices.find((price) => price.id === 'price_3')?.unit_amount).toBe(1200);
  });

  it('says what it would do on a dry run, and creates nothing', async () => {
    const stripe = fakeStripe();
    const { updates, outcomes } = await syncStripeCatalog({
      stripe: stripe.client,
      plans: [FREE, STARTER],
      dryRun: true,
    });

    expect(outcomes.map((outcome) => outcome.action)).toEqual(['would-create', 'would-create']);
    expect(updates).toEqual([]);
    expect(stripe.prices).toEqual([]);
    expect(stripe.products).toEqual([]);
  });
});
