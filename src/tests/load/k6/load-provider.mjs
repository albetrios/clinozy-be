import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
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
  receivers = new Map();
const id = (prefix) => `${prefix}_${randomBytes(12).toString('hex')}`;
let product;
let providerRequests = 0;
try {
  if (stripe) {
    if ((await stripe.balance.retrieve()).livemode !== false)
      throw new Error('Live Stripe prohibited');
    product = await stripe.products.create({
      name: `Isolated load ${Date.now()}`,
      metadata: { purpose: 'load-validation' },
    });
  }
  for (let index = 0; index < 2; index++) {
    const price = stripe
      ? await stripe.prices.create({
          product: product.id,
          unit_amount: 1000 * (index + 1),
          currency: 'usd',
          recurring: { interval: 'month' },
        })
      : {
          id: id('price'),
          unit_amount: 1000 * (index + 1),
          currency: 'usd',
          recurring: { interval: 'month' },
        };
    prices.push(price);
    const publicId = `pln_${randomBytes(12).toString('hex').slice(0, 21)}`;
    plans.push(publicId);
    await sql`INSERT INTO billing.plans(public_id,name,price_monthly,price_yearly,stripe_product_id,stripe_price_monthly_id) VALUES(${publicId},${`Isolated ${publicId}`},${10 * (index + 1)},${120 * (index + 1)},${product?.id || 'prod_local_fixture'},${price.id})`;
  }
} catch (error) {
  await cleanupProvider();
  throw error;
}
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
  const item = {
    id: id('si'),
    object: 'subscription_item',
    price,
    quantity: 1,
    current_period_start: now,
    current_period_end: now + 2592000,
  };
  const subscription = {
    id: identifier,
    object: 'subscription',
    customer: input.customer,
    livemode: false,
    status: 'incomplete',
    metadata,
    items: { object: 'list', data: [item] },
    cancel_at_period_end: false,
    canceled_at: null,
    trial_end: null,
    current_period_start: now,
    current_period_end: now + 2592000,
    latest_invoice: {
      id: id('in'),
      object: 'invoice',
      confirmation_secret: { client_secret: `${intent}_secret_fixture` },
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
  if (path === '/v1/invoices' || path === '/v1/payment_methods')
    return { object: 'list', data: [], has_more: false };
  throw new Error(`Unexpected provider operation ${method} ${path}`);
}
async function ownedSubscription(publicId) {
  const [row] =
    await sql`SELECT provider_subscription_id, provider_customer_id FROM billing.subscriptions WHERE public_id=${publicId} AND plan_id IN (SELECT id FROM billing.plans WHERE public_id IN ${sql(plans)})`;
  if (!row) throw new Error('Subscription is not owned by this fixture');
  return row;
}
async function activate(publicId) {
  const row = await ownedSubscription(publicId);
  let event;
  if (stripe) {
    const remote = await stripe.subscriptions.retrieve(row.provider_subscription_id, {
      expand: ['latest_invoice.confirmation_secret'],
    });
    const secret = remote.latest_invoice?.confirmation_secret?.client_secret;
    if (!secret) throw new Error('Actual PaymentIntent missing');
    await stripe.paymentIntents.confirm(secret.split('_secret_')[0], {
      payment_method: 'pm_card_visa',
      return_url: 'https://example.com',
    });
    for (let attempt = 0; attempt < 15; attempt++) {
      event = (
        await stripe.events.list({ type: 'customer.subscription.updated', limit: 100 })
      ).data.find(
        (item) =>
          item.data.object.id === row.provider_subscription_id &&
          item.data.object.status === 'active',
      );
      if (event) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } else {
    const subscription = subscriptions.get(row.provider_subscription_id);
    subscription.status = 'active';
    event = {
      id: id('evt'),
      object: 'event',
      api_version: '2026-09-30.endive',
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      type: 'customer.subscription.updated',
      data: { object: structuredClone(subscription) },
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
  return { delivered: true, mode, eventId: event.id };
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
    const input = await readInput(request),
      parsed = new URL(request.url, 'http://127.0.0.1'),
      path = parsed.pathname;
    let data;
    if (path === '/setup') data = { plans, mode };
    else if (path.startsWith('/stripe/')) {
      const [, , method, ...parts] = path.split('/');
      data = { status: 200, body: localStripe(method, `/${parts.join('/')}`, input.body) };
    } else if (path === '/activate') data = await activate(input.subscriptionId);
    else if (path === '/assert-subscription') {
      const row = await ownedSubscription(input.subscriptionId),
        remote = stripe
          ? await stripe.subscriptions.retrieve(row.provider_subscription_id)
          : subscriptions.get(row.provider_subscription_id);
      data = {
        matched:
          remote.status === 'active' &&
          remote.cancel_at_period_end === false &&
          remote.items.data[0].price.id === prices[1].id,
      };
    } else if (path === '/account-reads') {
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
  const errors = [];
  const attempt = async (operation, callback) => {
    try {
      await callback();
    } catch (error) {
      if (error.code !== 'resource_missing')
        errors.push({ operation, errorType: error.type || error.name });
    }
  };
  try {
    if (stripe && plans.length) {
      const rows =
        await sql`SELECT provider_subscription_id, provider_customer_id FROM billing.subscriptions WHERE plan_id IN (SELECT id FROM billing.plans WHERE public_id IN ${sql(plans)})`;
      for (const row of rows) {
        if (row.provider_subscription_id)
          await attempt('cancel-subscription', async () => {
            const subscription = await stripe.subscriptions.retrieve(row.provider_subscription_id);
            if (subscription.status !== 'canceled')
              await stripe.subscriptions.cancel(row.provider_subscription_id);
          });
        if (row.provider_customer_id)
          await attempt('delete-customer', () => stripe.customers.del(row.provider_customer_id));
      }
    }
    if (stripe) {
      for (const price of prices)
        await attempt('archive-price', () => stripe.prices.update(price.id, { active: false }));
      if (product)
        await attempt('archive-product', () =>
          stripe.products.update(product.id, { active: false }),
        );
    }
    if (plans.length)
      await attempt(
        'deactivate-local-plans',
        () => sql`UPDATE billing.plans SET is_active=false WHERE public_id IN ${sql(plans)}`,
      );
  } catch (error) {
    errors.push({ operation: 'cleanup', errorType: error.name });
  } finally {
    await sql.end();
  }
  if (process.env.LOAD_TEST_REPORT_DIR)
    writeFileSync(
      `${process.env.LOAD_TEST_REPORT_DIR}/provider-cleanup.json`,
      JSON.stringify({ mode, passed: errors.length === 0, errors }, null, 2),
    );
  if (errors.length) throw new Error('Provider cleanup failed; inspect provider-cleanup.json');
}
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
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
