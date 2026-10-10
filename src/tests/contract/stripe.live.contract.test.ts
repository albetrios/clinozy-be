import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  cancelStripeSubscription,
  createStripeCustomer,
  createStripeSubscription,
  getStripeClient,
  resumeStripeSubscription,
  retrieveStripeSubscriptionPaymentClientSecret,
  retrieveStripeSubscriptionSnapshot,
  updateStripeSubscriptionQuantity,
} from '@/infrastructure/payment/stripe.client.js';
import { registerThirdPartyContractTestIsolationHooks } from './helpers/register-contract-test-hooks.js';
import {
  StripeCustomerApiResponseContractSchema,
  StripeSubscriptionApiResponseContractSchema,
} from './schemas/stripe.schemas.js';

registerThirdPartyContractTestIsolationHooks();

/**
 * Live check against the Stripe sandbox (`pnpm test:contract:live`, `sk_test_` keys only): the
 * subscription lifecycle our billing code drives, through our own wrappers, with every response
 * validated by the same contract schemas the nock suite uses. Creates its own customer, product
 * and price, and removes them afterwards.
 */
describe('Stripe sandbox (live)', () => {
  const runId = randomUUID();
  const created: { customerId?: string; productId?: string; priceId?: string } = {};

  afterAll(async () => {
    const stripe = getStripeClient();
    if (created.customerId) await stripe.customers.del(created.customerId);
    if (created.priceId) await stripe.prices.update(created.priceId, { active: false });
    if (created.productId) await stripe.products.update(created.productId, { active: false });
  });

  it('creates, pays, resizes, schedules and resumes a cancellation, then cancels a subscription', async () => {
    const stripe = getStripeClient();
    const customer = await createStripeCustomer({
      email: `contract-live+${runId}@example.com`,
      name: 'Contract live check',
      metadata: { purpose: 'contract-live', run: runId },
      idempotencyKey: `contract-live-customer-${runId}`,
    });
    created.customerId = customer.id;
    expect(StripeCustomerApiResponseContractSchema.parse(customer).livemode).toBe(false);

    const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', {
      customer: customer.id,
    });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });
    const product = await stripe.products.create({
      name: `Contract live ${runId}`,
      metadata: { purpose: 'contract-live' },
    });
    created.productId = product.id;
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: 1000,
      recurring: { interval: 'month' },
    });
    created.priceId = price.id;

    // `default_incomplete`: the first invoice waits for the browser to confirm its payment.
    const subscription = await createStripeSubscription({
      customerId: customer.id,
      priceId: price.id,
      metadata: { purpose: 'contract-live' },
      idempotencyKey: `contract-live-subscription-${runId}`,
    });
    expect(StripeSubscriptionApiResponseContractSchema.parse(subscription).status).toBe(
      'incomplete',
    );
    expect(await retrieveStripeSubscriptionPaymentClientSecret(subscription.id)).toMatch(
      /_secret_/,
    );

    // Stand in for Stripe.js: pay the first invoice with the test card.
    const invoiceId =
      typeof subscription.latest_invoice === 'string'
        ? subscription.latest_invoice
        : subscription.latest_invoice?.id;
    expect(invoiceId).toBeDefined();
    await stripe.invoices.pay(invoiceId!, { payment_method: paymentMethod.id });
    const active = await retrieveStripeSubscriptionSnapshot(subscription.id);
    expect(StripeSubscriptionApiResponseContractSchema.parse(active).status).toBe('active');

    const resized = await updateStripeSubscriptionQuantity(subscription.id, 2, {
      idempotencyKey: `contract-live-quantity-${runId}`,
    });
    expect(
      StripeSubscriptionApiResponseContractSchema.parse(resized).items?.data[0]?.quantity,
    ).toBe(2);

    const scheduled = await cancelStripeSubscription(subscription.id);
    expect(StripeSubscriptionApiResponseContractSchema.parse(scheduled).cancel_at_period_end).toBe(
      true,
    );
    const resumed = await resumeStripeSubscription(subscription.id);
    expect(StripeSubscriptionApiResponseContractSchema.parse(resumed).cancel_at_period_end).toBe(
      false,
    );
    const canceled = await cancelStripeSubscription(subscription.id, false);
    expect(StripeSubscriptionApiResponseContractSchema.parse(canceled).status).toBe('canceled');
  });
});
