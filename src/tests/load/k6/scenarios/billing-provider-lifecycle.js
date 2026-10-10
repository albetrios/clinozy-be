import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { credentialPool, mintTokenPool } from '../helpers/pool.js';
import { API_PREFIX, PUBLIC_AUTH_FORM_HEADERS } from '../helpers/config.js';
import { assertCondition, requireData } from '../helpers/checks.js';
import { idempotencyKey } from '../helpers/idempotency.js';
import { PLAN_TIERS } from '../helpers/plan-tiers.js';

/** Provider API journeys and locally relayed webhook reconciliation; public provider transport is separate. */
const vus = Number(__ENV.VUS || '4'),
  iterations = Number(__ENV.ITERATIONS || '5');
// Dedicated billing fixtures may be supplied without overwriting the tenant-burst pool.
const suppliedActors = __ENV.LOAD_PROVIDER_CREDENTIAL_POOL
  ? JSON.parse(open(__ENV.LOAD_PROVIDER_CREDENTIAL_POOL))
  : Array.from(credentialPool);
const providerActors = Array.isArray(suppliedActors)
  ? suppliedActors
  : suppliedActors?.[__ENV.LOAD_PROVIDER_MODE];
const completed = new Counter('billing_provider_journeys_completed');
const cyclesCompleted = new Counter('billing_plan_cycles_completed');
const transitionsCompleted = new Counter('billing_plan_transitions_completed');
const crossCyclesRejected = new Counter('billing_cross_cycle_rejections');
const paymentProbesCompleted = new Counter('billing_payment_probe_cases_completed');
const tiers = PLAN_TIERS.map((entry) => entry.tier);
const expectedAmounts = Object.fromEntries(
  PLAN_TIERS.map((entry) => [entry.tier, [entry.monthly, entry.yearly]]),
);
const combinations = tiers.flatMap((tier) =>
  ['monthly', 'yearly']
    .filter((cycle) => cycle === 'monthly' || tier !== 'Free')
    .map((cycle) => ({ tier, cycle })),
);
const coverageThresholds = {};
for (const from of combinations) {
  coverageThresholds[`billing_plan_cycles_completed{tier:${from.tier},cycle:${from.cycle}}`] = [
    'count>=1',
  ];
  for (const to of combinations) {
    if (from.cycle === to.cycle && from.tier !== to.tier)
      coverageThresholds[
        `billing_plan_transitions_completed{from:${from.tier},to:${to.tier},cycle:${from.cycle}}`
      ] = ['count>=1'];
    if (from.cycle !== to.cycle)
      coverageThresholds[
        `billing_cross_cycle_rejections{from:${from.tier},to:${to.tier},cycle:${from.cycle}}`
      ] = ['count>=1'];
  }
}
export const options = {
  scenarios: { billing: { executor: 'per-vu-iterations', vus, iterations, maxDuration: '5m' } },
  thresholds: {
    ...coverageThresholds,
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    dropped_iterations: ['count==0'],
    billing_provider_journeys_completed: [`count==${vus * iterations}`],
    billing_payment_probe_cases_completed: ['count==5'],
    'http_req_duration{layer:backend}': [
      __ENV.LOAD_PROVIDER_MODE === 'sandbox' ? 'p(95)<3000' : 'p(95)<500',
    ],
  },
  setupTimeout: '2m',
};
function fixture(path, body) {
  return requireData(
    http.post(`${__ENV.LOAD_PROVIDER_URL}${path}`, JSON.stringify(body || {}), {
      headers: {
        Authorization: `Bearer ${__ENV.LOAD_PROVIDER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      tags: { name: `fixture${path}`, layer: 'fixture' },
    }),
    `provider fixture ${path}`,
  );
}
function request(method, path, token, body, expected = 200, key = idempotencyKey('provider')) {
  const response = http.request(
    method,
    `${API_PREFIX}${path}`,
    body ? JSON.stringify(body) : null,
    {
      headers: {
        ...PUBLIC_AUTH_FORM_HEADERS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Idempotency-Key': key,
      },
      tags: {
        name: `${method} ${path.replace(/\/(?:org|sub)_[a-z0-9]+/g, '/:id')}`,
        route: path,
        layer: 'backend',
      },
      responseCallback: http.expectedStatuses(expected),
    },
  );
  assertCondition(
    response.status === expected,
    `${method} ${path.split('/').slice(0, 3).join('/')}: exact ${expected}`,
  );
  return response;
}
export function setup() {
  if (
    vus * iterations < combinations.length ||
    !Array.isArray(providerActors) ||
    providerActors.length < vus * iterations + 1 ||
    new Set(providerActors.map((actor) => actor.userPublicId)).size !== providerActors.length ||
    !providerActors.every((actor) => actor.email && actor.password && actor.organizationPublicId) ||
    !providerActors
      .slice(0, vus * iterations)
      .every((actor) => actor.personalOrganizationPublicId) ||
    __ENV.LOAD_PROVIDER_URL !== 'http://127.0.0.1:3006'
  )
    throw new Error(
      'Seven advertised plan/cycle journeys, distinct prepared team/personal actors plus foreign tenant and loopback provider are required',
    );
  const provider = fixture('/setup');
  assertCondition(provider.catalog?.length === tiers.length, 'all four catalog tiers exist');
  for (const tier of tiers) {
    const entry = provider.catalog.find((item) => item.tier === tier);
    assertCondition(
      entry &&
        entry.monthly === expectedAmounts[tier][0] &&
        entry.yearly === expectedAmounts[tier][1],
      `${tier} catalog amounts match approved prices`,
    );
    assertCondition(
      typeof entry.title === 'string' &&
        typeof entry.description === 'string' &&
        entry.description.length > 0,
      `${tier} has title and description`,
    );
  }
  assertCondition(
    !provider.catalog.find((entry) => entry.tier === 'Free').prices.yearly,
    'Free annual provider price is absent',
  );
  assertCondition(
    new Set(provider.catalog.map((entry) => entry.title)).size === tiers.length &&
      new Set(provider.catalog.map((entry) => entry.description)).size === tiers.length,
    'catalog titles and descriptions are distinct',
  );
  return {
    actors: providerActors.slice(0, vus * iterations),
    ...provider,
    foreignToken: mintTokenPool([providerActors[vus * iterations]])[0].token,
  };
}

function verifyAccountReads({ subscriptionId, token, planId }) {
  const plan = requireData(request('GET', `/billing/plans/${planId}`, token), 'owned plan detail');
  assertCondition(plan.id === planId, 'plan detail matches the subscription plan');
  const expectedAccount = fixture('/account-reads', { subscriptionId: subscriptionId });
  const invoices = requireData(
    request('GET', '/billing/invoices?limit=100', token),
    'provider invoices',
  );
  const methods = requireData(
    request('GET', '/billing/payment-methods', token),
    'provider payment methods',
  );
  assertCondition(
    Array.isArray(invoices) &&
      JSON.stringify(invoices.map((invoice) => invoice.id).sort()) ===
        JSON.stringify(expectedAccount.invoiceIds),
    'invoice API matches independently retrieved provider records',
  );
  assertCondition(
    Array.isArray(methods) &&
      JSON.stringify(methods.map((method) => method.id).sort()) ===
        JSON.stringify(expectedAccount.paymentMethodIds),
    'payment-method API matches independently retrieved provider records',
  );
}

function assertProviderState({ subscriptionId, token, plan, cycle, cancelAtPeriodEnd = false }) {
  const current = requireData(
    request('GET', `/billing/subscriptions/${subscriptionId}`, token),
    'subscription state',
  );
  assertCondition(
    current.status === 'ACTIVE' &&
      current.plan_id === plan.id &&
      current.billing_cycle === cycle.toUpperCase() &&
      current.cancel_at_period_end === cancelAtPeriodEnd,
    'API plan/cycle/status matches requested state',
  );
  assertCondition(
    fixture('/assert-subscription', {
      subscriptionId,
      planId: plan.id,
      billingCycle: cycle,
      cancelAtPeriodEnd,
    }).matched === true,
    'independent provider and database price/cycle/status agree',
  );
}

function createJourney(data) {
  const index = (__VU - 1) * iterations + __ITER;
  const actor = data.actors[index];
  const combination = combinations[index % combinations.length];
  const initial = data.catalog.find((entry) => entry.tier === combination.tier);
  const cycle = combination.cycle;
  const login = requireData(
    request('POST', '/auth/login', null, { email: actor.email, password: actor.password }),
    'billing owner',
  );
  assertCondition(
    typeof actor.personalOrganizationPublicId === 'string',
    'personal-organization denial requires an explicit personal fixture scope',
  );
  const personalToken = requireData(
    request('POST', '/auth/switch-to-organization', login.access_token, {
      organization_id: actor.personalOrganizationPublicId,
    }),
    'personal billing context',
  ).access_token;
  request(
    'POST',
    '/billing/subscriptions',
    null,
    { plan_id: initial.id, billing_cycle: cycle },
    401,
  );
  request(
    'POST',
    '/billing/subscriptions',
    personalToken,
    { plan_id: initial.id, billing_cycle: cycle },
    422,
  );
  const token = requireData(
    request('POST', '/auth/switch-to-organization', personalToken, {
      organization_id: actor.organizationPublicId,
    }),
    'billing context',
  ).access_token;
  request('POST', '/billing/subscriptions', token, {}, 400);
  request(
    'POST',
    '/billing/subscriptions',
    token,
    { plan_id: initial.id, billing_cycle: 'invalid' },
    400,
  );
  request(
    'POST',
    '/billing/subscriptions',
    token,
    { plan_id: 'pln_000000000000000000000', billing_cycle: cycle },
    404,
  );
  if (initial[cycle] === 0) {
    const free = requireData(request('GET', `/billing/plans/${initial.id}`, token), 'Free catalog');
    assertCondition(
      free.price_yearly === null && JSON.stringify(free.billing_cycles) === '["monthly"]',
      'Free catalog does not advertise annual zero price',
    );
    request(
      'POST',
      '/billing/subscriptions',
      token,
      { plan_id: initial.id, billing_cycle: 'yearly' },
      422,
    );
  }
  const key = idempotencyKey('subscription-replay');
  const body = { plan_id: initial.id, billing_cycle: cycle };
  const subscription = requireData(
    request('POST', '/billing/subscriptions', token, body, 200, key),
    'subscription persisted',
  );
  assertCondition(
    subscription.status === (initial[cycle] === 0 ? 'ACTIVE' : 'INCOMPLETE') &&
      subscription.plan_id === initial.id,
    'Stripe-backed create preserves authoritative initial status',
  );
  const replayResponse = request('POST', '/billing/subscriptions', token, body, 200, key);
  const replay = requireData(replayResponse, 'idempotent subscription replay');
  assertCondition(
    replay.id === subscription.id && replayResponse.headers['X-Idempotency-Replay'] === 'true',
    'replay marker and stable subscription identifier',
  );
  const conflict = request(
    'POST',
    '/billing/subscriptions',
    token,
    { plan_id: data.catalog.find((entry) => entry.id !== initial.id).id, billing_cycle: cycle },
    422,
    key,
  );
  assertCondition(
    conflict.json('error.code') === 'idempotency_key_reuse',
    'conflicting replay is rejected specifically for idempotency key reuse',
  );
  request('POST', '/billing/subscriptions', token, body, 409);
  request('GET', `/billing/subscriptions/${subscription.id}`, data.foreignToken, null, 404);
  request(
    'GET',
    `/billing/subscriptions/${subscription.id}/payment-setup`,
    data.foreignToken,
    null,
    404,
  );
  request('POST', `/billing/subscriptions/${subscription.id}/cancel`, data.foreignToken, {}, 404);
  return { index, subscription, token, initial, cycle };
}

function activateJourney({ subscription, token, initial, cycle }) {
  const payment = requireData(
    request('GET', `/billing/subscriptions/${subscription.id}/payment-setup`, token),
    'payment setup',
  );
  assertCondition(
    initial[cycle] === 0
      ? payment.client_secret === null
      : typeof payment.client_secret === 'string' && payment.client_secret.startsWith('pi_'),
    'zero-price no-charge versus paid provider intent',
  );
  const setup = requireData(
    request('POST', '/billing/payment-methods/setup', token, {}),
    'payment-method setup',
  );
  assertCondition(
    typeof setup.client_secret === 'string' && setup.client_secret.startsWith('seti_'),
    'payment-method setup references provider intent',
  );
  const activation = fixture('/activate', { subscriptionId: subscription.id });
  assertCondition(
    activation.delivered === true && activation.workerProcessed === true,
    'signed provider event processed by local worker',
  );
  let active;
  for (let attempt = 0; attempt < 60; attempt++) {
    active = requireData(
      request('GET', `/billing/subscriptions/${subscription.id}`, token),
      'subscription activation',
    );
    if (active.status === 'ACTIVE') break;
    assertCondition(
      active.status === 'INCOMPLETE',
      'activation has not entered an unexpected state',
    );
    sleep(0.25);
  }
  assertCondition(
    active.status === 'ACTIVE',
    'subscription matches authoritative active provider state',
  );
  assertProviderState({ subscriptionId: subscription.id, token, plan: initial, cycle });
  verifyAccountReads({ subscriptionId: subscription.id, token, planId: initial.id });
}

function verifyPaymentProbes({ index, subscription, token, initial, cycle }) {
  if (index === 1) {
    for (const probeCase of ['decline', 'insufficient-funds', 'expired', 'sca', 'canceled']) {
      const probe = fixture('/payment-probe', { subscriptionId: subscription.id, case: probeCase });
      assertCondition(
        probe.matched === true,
        `${probeCase}: provider payment state matches expected outcome`,
      );
      if (['decline', 'insufficient-funds', 'expired'].includes(probeCase)) {
        const recovered = fixture('/recover-payment', {
          subscriptionId: subscription.id,
          intentId: probe.intentId,
        });
        assertCondition(
          recovered.matched === true && recovered.status === 'succeeded',
          `${probeCase}: payment recovery succeeds with valid virtual method`,
        );
      }
      paymentProbesCompleted.add(1, { case: probeCase });
    }
    assertProviderState({ subscriptionId: subscription.id, token, plan: initial, cycle });
  }
}

function verifyPlanChanges(data, { subscription, token, initial, cycle }) {
  for (const target of data.catalog.filter(
    (entry) => entry.id !== initial.id && entry.prices[cycle],
  )) {
    const changed = requireData(
      request('POST', `/billing/subscriptions/${subscription.id}/change-plan`, token, {
        plan_id: target.id,
      }),
      'changed plan',
    );
    assertCondition(changed.plan_id === target.id, 'plan change persisted');
    assertProviderState({ subscriptionId: subscription.id, token, plan: target, cycle });
    transitionsCompleted.add(1, { from: initial.tier, to: target.tier, cycle });
    requireData(
      request('POST', `/billing/subscriptions/${subscription.id}/change-plan`, token, {
        plan_id: initial.id,
      }),
      'restore initial plan',
    );
    assertProviderState({ subscriptionId: subscription.id, token, plan: initial, cycle });
  }
  for (const target of combinations.filter((entry) => entry.cycle !== cycle)) {
    const plan = data.catalog.find((entry) => entry.tier === target.tier);
    request(
      'POST',
      `/billing/subscriptions/${subscription.id}/change-plan`,
      token,
      { plan_id: plan.id, billing_cycle: target.cycle },
      400,
    );
    assertProviderState({ subscriptionId: subscription.id, token, plan: initial, cycle });
    crossCyclesRejected.add(1, { from: initial.tier, to: target.tier, cycle });
  }
  request('POST', `/billing/subscriptions/${subscription.id}/change-plan`, token, {}, 400);
  request(
    'POST',
    `/billing/subscriptions/${subscription.id}/change-plan`,
    token,
    { plan_id: 'pln_000000000000000000000' },
    404,
  );
  assertProviderState({ subscriptionId: subscription.id, token, plan: initial, cycle });
}

function verifyCancellation({ subscription, token, initial, cycle }) {
  const canceled = requireData(
    request('POST', `/billing/subscriptions/${subscription.id}/cancel`, token, {}),
    'period-end cancel',
  );
  assertCondition(canceled.cancel_at_period_end === true, 'cancel persisted');
  assertProviderState({
    subscriptionId: subscription.id,
    token,
    plan: initial,
    cycle,
    cancelAtPeriodEnd: true,
  });
  const resumed = requireData(
    request('POST', `/billing/subscriptions/${subscription.id}/resume`, token, {}),
    'resume',
  );
  assertCondition(resumed.cancel_at_period_end === false, 'resume persisted');
  assertProviderState({ subscriptionId: subscription.id, token, plan: initial, cycle });
  const all = requireData(request('GET', '/billing/subscriptions', token), 'owned subscriptions');
  assertCondition(
    all.length === 1 && all[0].id === subscription.id,
    'no duplicate subscription after replay',
  );
  cyclesCompleted.add(1, { tier: initial.tier, cycle });
  completed.add(1);
}

export default function (data) {
  const journey = createJourney(data);
  activateJourney(journey);
  verifyPaymentProbes(journey);
  verifyPlanChanges(data, journey);
  verifyCancellation(journey);
}
