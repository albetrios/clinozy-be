import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { globalAgent } from 'node:https';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import Stripe from 'stripe';
import postgres from 'postgres';

/** Authenticated loopback provider and signed receiver for contract/sandbox load journeys. */
const mode = process.env.LOAD_PROVIDER_MODE;
const authorization = process.env.LOAD_PROVIDER_TOKEN;
if (
  process.env.TEST_MODE !== 'true' ||
  !authorization ||
  authorization.length < 32 ||
  !['contract', 'sandbox'].includes(mode)
)
  throw new Error('Explicit provider mode and authorization required');
const databaseUrl = new URL(process.env.DATABASE_OPERATOR_URL || process.env.DATABASE_URL);
if (!/(?:^|_)(?:load|test)(?:_|$)/.test(databaseUrl.pathname.slice(1)))
  throw new Error('Provider requires a scratch database');
if (mode === 'sandbox' && !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))
  throw new Error('Sandbox Stripe key required');
const stripe =
  mode === 'sandbox'
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2026-09-30.endive',
        httpAgent: globalAgent,
        timeout: 15000,
        maxNetworkRetries: 0,
      })
    : null;
const sql = postgres(databaseUrl.toString(), { max: 1 });
const plans = [],
  prices = [],
  subscriptions = new Map(),
  customers = new Map(),
  events = new Map(),
  receivers = new Map(),
  paymentMethods = new Map(),
  paymentProbes = new Map();
const id = (prefix) => `${prefix}_${randomBytes(12).toString('hex')}`;
const catalog = [];
const tiers = [
  { tier: 'Free', monthly: 0, yearly: null, seats: 1 },
  { tier: 'Starter', monthly: 10, yearly: 100, seats: 5 },
  { tier: 'Growth', monthly: 30, yearly: 300, seats: 15 },
  { tier: 'Pro', monthly: 99, yearly: 990, seats: 25 },
];
const evidence = {
  catalogReadback: stripe ? 'real-sandbox' : 'contract-fixture',
  stripeIngress: 'local-signed-replay',
  browserSca: 'not-verified',
};
let providerRequests = 0;
async function readCatalogSource() {
  let source;
  if (stripe) {
    if ((await stripe.balance.retrieve()).livemode !== false)
      throw new Error('Live Stripe prohibited');
    const catalogPath = process.env.LOAD_PROVIDER_CATALOG_FILE;
    if (!catalogPath) throw new Error('Existing private sandbox catalog required');
    source = JSON.parse(readFileSync(catalogPath, 'utf8'));
    if (source.realStripeSandbox !== true || source.products?.length !== tiers.length)
      throw new Error('Expected four retained sandbox products');
  }
  return source;
}
async function readCatalogProduct({ tier, entry }) {
  const product = stripe
    ? await stripe.products.retrieve(entry.id)
    : {
        id: id('prod'),
        name: `${tier.tier} — Contract Validation`,
        description: `Synthetic ${tier.tier} plan with ${tier.seats} included seats.`,
        livemode: false,
        active: true,
      };
  if (
    product.deleted ||
    product.livemode !== false ||
    product.active !== true ||
    (stripe && (product.name !== entry.title || product.description !== entry.description))
  )
    throw new Error(`Independent sandbox product readback failed for ${tier.tier}`);
  return product;
}
async function readCatalogPrice({ tier, entry, product, cycle }) {
  const amount = tier[cycle];
  const stored = entry?.prices.find((price) => price.cycle === cycle);
  if (stripe && !stored) throw new Error(`Missing ${tier.tier} ${cycle} price`);
  const price = stripe
    ? await stripe.prices.retrieve(stored.id)
    : {
        id: id('price'),
        product: product.id,
        unit_amount: amount * 100,
        currency: 'usd',
        recurring: { interval: cycle === 'yearly' ? 'year' : 'month', interval_count: 1 },
        livemode: false,
        active: true,
      };
  if (
    price.livemode !== false ||
    price.active !== true ||
    price.product !== product.id ||
    price.unit_amount !== amount * 100 ||
    price.currency !== 'usd' ||
    price.recurring?.interval !== (cycle === 'yearly' ? 'year' : 'month') ||
    price.recurring?.interval_count !== 1
  )
    throw new Error(`Independent sandbox price readback failed for ${tier.tier} ${cycle}`);
  return price;
}
async function mapCatalogPlan({ product, tier, cyclePrices }) {
  const existing = await sql`SELECT public_id, name, description, price_monthly, price_yearly,
    currency, included_seats, stripe_product_id, stripe_price_monthly_id, stripe_price_yearly_id
    FROM billing.plans WHERE stripe_product_id=${product.id}
    OR stripe_price_monthly_id=${cyclePrices.monthly}
    OR (${cyclePrices.yearly || null}::text IS NOT NULL AND stripe_price_yearly_id=${cyclePrices.yearly || null})`;
  if (existing.length > 1)
    throw new Error('Ambiguous catalog mapping; use a fresh scratch database');
  const stored = existing[0];
  if (
    stored &&
    (!stored.name.startsWith(product.name) ||
      stored.description !== product.description ||
      Number(stored.price_monthly) !== tier.monthly ||
      Number(stored.price_yearly) !== (tier.yearly ?? 0) ||
      stored.currency !== 'USD' ||
      stored.included_seats !== tier.seats ||
      stored.stripe_product_id !== product.id ||
      stored.stripe_price_monthly_id !== cyclePrices.monthly ||
      stored.stripe_price_yearly_id !== (cyclePrices.yearly || null))
  )
    throw new Error('Existing catalog mapping does not match independent provider readback');
  const publicId = stored?.public_id || `pln_${randomBytes(12).toString('hex').slice(0, 21)}`;
  if (!stored)
    await sql`INSERT INTO billing.plans(public_id,name,description,price_monthly,price_yearly,currency,included_seats,stripe_product_id,stripe_price_monthly_id,stripe_price_yearly_id)
      VALUES(${publicId},${`${product.name} ${publicId}`},${product.description},${tier.monthly},${tier.yearly ?? 0},${'USD'},${tier.seats},${product.id},${cyclePrices.monthly},${cyclePrices.yearly || null})`;
  return publicId;
}
async function configureCatalog() {
  const source = await readCatalogSource();
  for (const tier of tiers) {
    const entry = source?.products.find((item) => item.title?.includes(` ${tier.tier} — `));
    if (stripe && !entry) throw new Error(`Missing sandbox tier ${tier.tier}`);
    const product = await readCatalogProduct({ tier, entry });
    const cyclePrices = {};
    for (const cycle of ['monthly', 'yearly']) {
      const amount = tier[cycle];
      if (amount === null) {
        if (entry?.prices.some((price) => price.cycle === cycle))
          throw new Error('Free annual price is not offered');
        continue;
      }
      const price = await readCatalogPrice({ tier, entry, product, cycle });
      prices.push(price);
      cyclePrices[cycle] = price.id;
    }
    const publicId = await mapCatalogPlan({ product, tier, cyclePrices });
    plans.push(publicId);
    catalog.push({
      ...tier,
      id: publicId,
      title: product.name,
      description: product.description,
      prices: cyclePrices,
    });
  }
}
// Bind the loopback server while independent catalog reads finish; requests await readiness.
let catalogError;
const catalogReady = configureCatalog().catch((error) => {
  catalogError = error;
});
function form(body) {
  return typeof body === 'string' ? Object.fromEntries(new URLSearchParams(body)) : body || {};
}
function createLocalSubscription(input) {
  const now = Math.floor(Date.now() / 1000),
    identifier = id('sub'),
    intent = id('pi');
  const metadata = Object.fromEntries(
    Object.entries(input)
      .filter(([field]) => /^metadata\[/.test(field))
      .map(([field, value]) => [field.slice(9, -1), value]),
  );
  const price = prices.find((item) => item.id === input['items[0][price]']);
  if (!(price && customers.has(input.customer))) throw new Error('Unknown provider price/customer');
  const periodEnd = now + (price.recurring.interval === 'year' ? 31536000 : 2592000);
  const item = {
    id: id('si'),
    object: 'subscription_item',
    price,
    quantity: 1,
    current_period_start: now,
    current_period_end: periodEnd,
  };
  const subscription = {
    id: identifier,
    object: 'subscription',
    customer: input.customer,
    livemode: false,
    status: price.unit_amount === 0 ? 'active' : 'incomplete',
    metadata,
    items: { object: 'list', data: [item] },
    cancel_at_period_end: false,
    canceled_at: null,
    trial_end: null,
    current_period_start: now,
    current_period_end: periodEnd,
    latest_invoice: {
      id: id('in'),
      object: 'invoice',
      confirmation_secret:
        price.unit_amount === 0 ? null : { client_secret: `${intent}_secret_fixture` },
    },
  };
  subscriptions.set(identifier, subscription);
  return subscription;
}
function updateLocalSubscription({ key, method, input }) {
  const subscription = subscriptions.get(key);
  if (method === 'delete') {
    subscription.status = 'canceled';
    subscription.canceled_at = Math.floor(Date.now() / 1000);
  }
  if (method === 'post') {
    if (input.cancel_at_period_end !== undefined)
      subscription.cancel_at_period_end = String(input.cancel_at_period_end) === 'true';
    if (input['items[0][price]'])
      subscription.items.data[0].price = prices.find(
        (item) => item.id === input['items[0][price]'],
      );
    if (input['items[0][quantity]'])
      subscription.items.data[0].quantity = Number(input['items[0][quantity]']);
  }
  return subscription;
}
function localStripe(method, path, body) {
  providerRequests++;
  const input = form(body),
    key = path.split('/').at(-1);
  if (path === '/v1/customers' && method === 'post') {
    const customer = {
      id: id('cus'),
      object: 'customer',
      livemode: false,
      invoice_settings: { default_payment_method: null },
    };
    customers.set(customer.id, customer);
    return customer;
  }
  if (path.startsWith('/v1/customers/') && customers.has(key)) {
    if (method === 'delete') {
      customers.delete(key);
      return { id: key, object: 'customer', deleted: true };
    }
    return customers.get(key);
  }
  if (path === '/v1/setup_intents' && method === 'post') {
    const identifier = id('seti');
    return {
      id: identifier,
      object: 'setup_intent',
      client_secret: `${identifier}_secret_fixture`,
      livemode: false,
      status: 'requires_payment_method',
    };
  }
  if (path === '/v1/subscriptions' && method === 'post') {
    return createLocalSubscription(input);
  }
  if (path.startsWith('/v1/subscriptions/') && subscriptions.has(key)) {
    return updateLocalSubscription({ key, method, input });
  }
  if (path === '/v1/events')
    return { object: 'list', data: Array.from(events.values()), has_more: false };
  if (path.startsWith('/v1/events/') && events.has(key)) return events.get(key);
  if (path === '/v1/payment_methods')
    return {
      object: 'list',
      data: Array.from(paymentMethods.values()).filter(
        (method) => method.customer === input.customer,
      ),
      has_more: false,
    };
  if (path === '/v1/invoices') return { object: 'list', data: [], has_more: false };
  throw new Error(`Unexpected provider operation ${method} ${path}`);
}
async function ownedSubscription(publicId) {
  const [row] =
    await sql`SELECT s.provider_subscription_id, s.provider_customer_id, s.status, s.billing_cycle,
      s.cancel_at_period_end, s.seats, p.public_id AS plan_public_id, o.public_id AS organization_public_id
      FROM billing.subscriptions s JOIN billing.plans p ON p.id=s.plan_id
      JOIN tenancy.organizations o ON o.id=s.organization_id
      WHERE s.public_id=${publicId} AND p.public_id IN ${sql(plans)}`;
  if (!row) throw new Error('Subscription is not owned by this fixture');
  return row;
}
async function readProviderSubscription(row, expanded = false) {
  const remote = stripe
    ? await stripe.subscriptions.retrieve(
        row.provider_subscription_id,
        expanded ? { expand: ['latest_invoice.confirmation_secret'] } : {},
      )
    : subscriptions.get(row.provider_subscription_id);
  const customerId = typeof remote?.customer === 'string' ? remote.customer : remote?.customer?.id;
  if (
    remote?.livemode !== false ||
    customerId !== row.provider_customer_id ||
    remote.metadata?.organization_id !== row.organization_public_id
  )
    throw new Error('Independent provider subscription ownership check failed');
  return remote;
}
async function preparePaymentMethod({ publicId, row, remote }) {
  if (stripe) {
    const setup = await stripe.setupIntents.create(
      {
        customer: row.provider_customer_id,
        allowed_payment_method_types: ['card'],
        payment_method: 'pm_card_visa',
        confirm: true,
        usage: 'off_session',
        metadata: { purpose: 'load-validation', subscription_id: publicId },
      },
      { idempotencyKey: `load-setup:${publicId}` },
    );
    if (setup.livemode !== false || setup.status !== 'succeeded')
      throw new Error('Owned card setup did not succeed');
    const methodId =
      typeof setup.payment_method === 'string' ? setup.payment_method : setup.payment_method?.id;
    const method = await stripe.paymentMethods.retrieve(methodId);
    if (method.livemode !== false || method.customer !== row.provider_customer_id)
      throw new Error('Payment method is not owned by the fixture customer');
    await stripe.customers.update(
      row.provider_customer_id,
      { invoice_settings: { default_payment_method: methodId } },
      { idempotencyKey: `load-default-customer:${publicId}` },
    );
    await stripe.subscriptions.update(
      remote.id,
      { default_payment_method: methodId },
      { idempotencyKey: `load-default-subscription:${publicId}` },
    );
    return methodId;
  }
  const customer = customers.get(row.provider_customer_id);
  if (!customer.invoice_settings.default_payment_method) {
    const method = {
      id: id('pm'),
      object: 'payment_method',
      livemode: false,
      type: 'card',
      customer: customer.id,
      card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2035 },
    };
    paymentMethods.set(method.id, method);
    customer.invoice_settings.default_payment_method = method.id;
  }
  remote.default_payment_method = customer.invoice_settings.default_payment_method;
  return remote.default_payment_method;
}
async function activate(publicId) {
  const row = await ownedSubscription(publicId);
  const remote = await readProviderSubscription(row, true);
  const methodId = await preparePaymentMethod({ publicId, row, remote });
  const zeroPrice = remote.items.data[0].price.unit_amount === 0;
  let event;
  if (stripe) {
    const secret = remote.latest_invoice?.confirmation_secret?.client_secret;
    if (zeroPrice) {
      if (secret || remote.status !== 'active')
        throw new Error('Free subscription must activate without a PaymentIntent');
    } else {
      if (!secret) throw new Error('Actual PaymentIntent missing');
      const intent = await stripe.paymentIntents.confirm(
        secret.split('_secret_')[0],
        {
          payment_method: methodId,
          return_url: 'https://example.com',
        },
        { idempotencyKey: `load-activate:${publicId}` },
      );
      if (intent.livemode !== false || intent.status !== 'succeeded')
        throw new Error('Paid sandbox PaymentIntent did not succeed');
    }
    for (let attempt = 0; attempt < 15; attempt++) {
      event = (
        await stripe.events.list({
          type: zeroPrice ? 'customer.subscription.created' : 'customer.subscription.updated',
          limit: 100,
        })
      ).data.find(
        (item) =>
          item.data.object.id === row.provider_subscription_id &&
          item.data.object.status === 'active',
      );
      if (event) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } else {
    remote.status = 'active';
    event = {
      id: id('evt'),
      object: 'event',
      api_version: '2026-09-30.endive',
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      type: 'customer.subscription.updated',
      data: { object: structuredClone(remote) },
    };
    events.set(event.id, event);
  }
  if (!event) throw new Error('Activation event missing');
  const payload = JSON.stringify(event),
    timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET.split(',')[0].trim())
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  // The real ingress verifies the signature and queues the real worker; never update local status here.
  const response = await fetch('http://127.0.0.1:3002/api/v1/billing/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': `t=${timestamp},v1=${signature}`,
    },
    body: payload,
  });
  if (response.status !== 200) throw new Error(`Webhook ingress ${response.status}`);
  return {
    delivered: true,
    mode,
    eventId: event.id,
    charged: !zeroPrice,
    ownedPaymentMethodReady: Boolean(methodId),
    evidence,
  };
}
async function assertSubscription(input) {
  if (typeof input.cancelAtPeriodEnd !== 'boolean')
    throw new Error('Explicit expected cancellation state required');
  const row = await ownedSubscription(input.subscriptionId);
  const plan = catalog.find((item) => item.id === input.planId);
  if (!plan?.prices[input.billingCycle])
    throw new Error('Expected advertised plan and cycle required');
  const remote = await readProviderSubscription(row);
  const price = remote.items.data[0].price;
  const provider = {
    status: remote.status,
    billingCycle: price.recurring.interval === 'year' ? 'yearly' : 'monthly',
    priceMatched: price.id === plan.prices[input.billingCycle],
    cancelAtPeriodEnd: remote.cancel_at_period_end,
  };
  const database = {
    status: row.status,
    planId: row.plan_public_id,
    billingCycle: row.billing_cycle.toLowerCase(),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    seats: row.seats,
  };
  return {
    matched:
      provider.status === 'active' &&
      provider.cancelAtPeriodEnd === input.cancelAtPeriodEnd &&
      provider.priceMatched &&
      provider.billingCycle === input.billingCycle &&
      database.status === 'ACTIVE' &&
      database.planId === input.planId &&
      database.billingCycle === input.billingCycle &&
      database.cancelAtPeriodEnd === input.cancelAtPeriodEnd,
    provider,
    database,
    evidence,
  };
}
const paymentCases = {
  decline: {
    method: 'pm_card_chargeDeclined',
    status: 'requires_payment_method',
    code: 'card_declined',
    declineCode: 'generic_decline',
  },
  'insufficient-funds': {
    method: 'pm_card_chargeDeclinedInsufficientFunds',
    status: 'requires_payment_method',
    code: 'card_declined',
    declineCode: 'insufficient_funds',
  },
  expired: {
    method: 'pm_card_chargeDeclinedExpiredCard',
    status: 'requires_payment_method',
    code: 'expired_card',
  },
  sca: { method: 'pm_card_threeDSecure2Required', status: 'requires_action' },
  canceled: { status: 'canceled' },
};
async function paymentProbe(input) {
  const configuration = paymentCases[input.case];
  if (!configuration) throw new Error('Unsupported bounded payment case');
  const row = await ownedSubscription(input.subscriptionId);
  await readProviderSubscription(row);
  const key = `${input.subscriptionId}:${input.case}`;
  if (paymentProbes.has(key)) return paymentProbes.get(key).result;
  let intent, failure;
  if (stripe) {
    intent = await stripe.paymentIntents.create(
      {
        amount: 100,
        currency: 'usd',
        customer: row.provider_customer_id,
        allowed_payment_method_types: ['card'],
        metadata: {
          purpose: 'load-validation',
          subscription_id: input.subscriptionId,
          case: input.case,
        },
      },
      { idempotencyKey: `load-probe:${key}` },
    );
    if (intent.livemode !== false) throw new Error('Live payment probe prohibited');
    if (input.case === 'canceled') {
      await stripe.paymentIntents.cancel(
        intent.id,
        {},
        { idempotencyKey: `load-probe-cancel:${key}` },
      );
    } else {
      try {
        await stripe.paymentIntents.confirm(
          intent.id,
          {
            payment_method: configuration.method,
            return_url: 'https://example.com',
          },
          { idempotencyKey: `load-probe-confirm:${key}` },
        );
      } catch (error) {
        if (error.type !== 'StripeCardError') throw error;
        failure = { code: error.code, declineCode: error.decline_code };
      }
    }
    intent = await stripe.paymentIntents.retrieve(intent.id);
    if (
      intent.livemode !== false ||
      intent.customer !== row.provider_customer_id ||
      intent.metadata.subscription_id !== input.subscriptionId
    )
      throw new Error('Independent payment probe ownership check failed');
  } else {
    intent = {
      id: id('pi'),
      status: configuration.status,
      customer: row.provider_customer_id,
      livemode: false,
    };
    failure = { code: configuration.code, declineCode: configuration.declineCode };
  }
  const errorCode = intent.last_payment_error?.code || failure?.code || null;
  const declineCode = intent.last_payment_error?.decline_code || failure?.declineCode || null;
  const result = {
    case: input.case,
    expected: configuration.status,
    intentId: intent.id,
    status: intent.status,
    errorCode,
    declineCode,
    matched:
      intent.status === configuration.status &&
      (!configuration.code || errorCode === configuration.code) &&
      (!configuration.declineCode || declineCode === configuration.declineCode),
    requiresAction: intent.status === 'requires_action',
    evidence: {
      provider: stripe ? 'real-sandbox-api' : 'contract-fixture',
      browserSca: 'not-verified',
      subscriptionPayment: false,
    },
  };
  const probe = {
    subscriptionId: input.subscriptionId,
    intentId: intent.id,
    customerId: row.provider_customer_id,
    case: input.case,
    result,
  };
  paymentProbes.set(key, probe);
  return result;
}
async function recoverPayment(input) {
  const row = await ownedSubscription(input.subscriptionId);
  const probe = Array.from(paymentProbes.values()).find(
    (item) =>
      item.subscriptionId === input.subscriptionId &&
      item.intentId === input.intentId &&
      item.customerId === row.provider_customer_id,
  );
  if (!probe) throw new Error('Payment intent is not owned by this fixture');
  if (probe.case === 'sca' || probe.case === 'canceled')
    throw new Error('SCA and canceled probes cannot use decline recovery');
  let intent;
  if (stripe) {
    intent = await stripe.paymentIntents.retrieve(probe.intentId);
    if (
      intent.livemode !== false ||
      intent.customer !== row.provider_customer_id ||
      intent.metadata.subscription_id !== input.subscriptionId
    )
      throw new Error('Independent recovery ownership check failed');
    if (intent.status === 'requires_payment_method')
      await stripe.paymentIntents.confirm(
        intent.id,
        { payment_method: 'pm_card_visa', return_url: 'https://example.com' },
        { idempotencyKey: `load-recover:${input.subscriptionId}:${input.intentId}` },
      );
    intent = await stripe.paymentIntents.retrieve(intent.id);
  } else intent = { status: 'succeeded' };
  return {
    matched: intent.status === 'succeeded',
    status: intent.status,
    evidence: {
      provider: stripe ? 'real-sandbox-api' : 'contract-fixture',
      subscriptionPayment: false,
    },
  };
}
function receive(path, input) {
  const identifier = path.split('/').at(-1),
    receiver = receivers.get(identifier);
  if (!receiver) throw new Error('Unknown receiver');
  const body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
  const headers = input.headers || {},
    signature = String(headers['x-webhook-signature'] || '');
  const matched = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(signature);
  const expected =
    matched && createHmac('sha256', receiver.secret).update(`${matched[1]}.${body}`).digest('hex');
  const valid = Boolean(
    matched &&
      Math.abs(Date.now() / 1000 - Number(matched[1])) < 300 &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(matched[2])),
  );
  const payload = JSON.parse(body);
  if (
    !valid ||
    payload.event !== 'webhook.test' ||
    !payload.data?.webhook_id ||
    headers['x-webhook-event'] !== 'webhook.test'
  )
    return { status: 401, body: { accepted: false } };
  receiver.deliveries.push({
    signatureVerified: true,
    webhookId: payload.data.webhook_id,
    event: payload.event,
    timestampFresh: true,
    responseStatus: receiver.responseStatus,
  });
  return { status: receiver.responseStatus, body: { accepted: receiver.responseStatus === 200 } };
}
async function accountReadIds(subscriptionId) {
  const row = await ownedSubscription(subscriptionId);
  const customerId = row.provider_customer_id;
  if (!customerId) throw new Error('Owned subscription lacks a provider customer');
  const invoices = stripe
    ? await stripe.invoices.list({ customer: customerId, limit: 100 })
    : localStripe('get', '/v1/invoices', { customer: customerId });
  const methods = stripe
    ? await stripe.paymentMethods.list({ customer: customerId, type: 'card' })
    : localStripe('get', '/v1/payment_methods', { customer: customerId });
  return {
    invoiceIds: invoices.data.map((invoice) => invoice.id).sort(),
    paymentMethodIds: methods.data.map((method) => method.id).sort(),
  };
}

function configureReceiver(input) {
  if (mode !== 'contract') throw new Error('Receiver faults require contract mode');
  const receiver = receivers.get(input.id);
  if (!receiver) throw new Error('Unknown receiver');
  if (input.responseStatus !== undefined) {
    if (![200, 503].includes(input.responseStatus)) throw new Error('Unsupported receiver status');
    receiver.responseStatus = input.responseStatus;
  }
  if (input.secret !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(input.secret)) throw new Error('Invalid receiver secret');
    receiver.secret = input.secret;
  }
  return { configured: true };
}

async function readInput(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 65536) throw new Error('Payload too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  try {
    if (request.headers.authorization !== `Bearer ${authorization}`) {
      response.writeHead(403).end('{}');
      return;
    }
    await catalogReady;
    if (catalogError) throw catalogError;
    const input = await readInput(request),
      parsed = new URL(request.url, 'http://127.0.0.1'),
      path = parsed.pathname;
    let data;
    if (path === '/setup') data = { plans, mode, catalog, evidence };
    else if (path.startsWith('/stripe/')) {
      if (mode !== 'contract') throw new Error('Simulated Stripe transport requires contract mode');
      const [, , method, ...parts] = path.split('/');
      data = {
        status: 200,
        body: localStripe(method, `/${parts.join('/')}`, {
          ...Object.fromEntries(parsed.searchParams),
          ...form(input.body),
        }),
      };
    } else if (path === '/activate') data = await activate(input.subscriptionId);
    else if (path === '/assert-subscription') data = await assertSubscription(input);
    else if (path === '/payment-probe') data = await paymentProbe(input);
    else if (path === '/recover-payment') data = await recoverPayment(input);
    else if (path === '/account-reads') {
      data = await accountReadIds(input.subscriptionId);
    } else if (path === '/receiver/create') {
      const identifier = id('receiver'),
        secret = randomBytes(32).toString('hex');
      receivers.set(identifier, { secret, deliveries: [], responseStatus: 200 });
      data = { id: identifier, secret, url: `https://1.1.1.1/load-webhook/${identifier}` };
    } else if (path === '/receiver/configure') {
      data = configureReceiver(input);
    } else if (path === '/receiver/status') {
      const receiver = receivers.get(input.id);
      if (!receiver) throw new Error('Unknown receiver');
      data = { deliveries: receiver.deliveries };
    } else if (path.startsWith('/receiver/load-webhook/')) data = receive(path, input);
    else if (path === '/state')
      data = {
        mode,
        providerRequests,
        subscriptions: subscriptions.size,
        receivers: receivers.size,
        verifiedDeliveries: Array.from(receivers.values()).reduce(
          (count, item) => count + item.deliveries.length,
          0,
        ),
      };
    else {
      response.writeHead(404).end('{}');
      return;
    }
    response.end(JSON.stringify({ data }));
  } catch (error) {
    response.writeHead(500).end(JSON.stringify({ error: error.message }));
  }
});
server.listen(3006, '127.0.0.1');
let stopping = false;
async function cleanupProvider() {
  await sql.end();
  if (process.env.LOAD_TEST_REPORT_DIR)
    writeFileSync(
      `${process.env.LOAD_TEST_REPORT_DIR}/provider-cleanup.json`,
      JSON.stringify({ mode, passed: true, objectsRetained: true, plans, evidence }, null, 2),
    );
}
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  await catalogReady;
  await cleanupProvider();
}
process.on('SIGTERM', () =>
  stop().catch(() => {
    process.exitCode = 1;
  }),
);
process.on('SIGINT', () =>
  stop().catch(() => {
    process.exitCode = 1;
  }),
);
