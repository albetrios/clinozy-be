import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { credentialPool, mintTokenPool } from '../helpers/pool.js';
import { API_PREFIX, PUBLIC_AUTH_FORM_HEADERS } from '../helpers/config.js';
import { assertCondition, requireData } from '../helpers/checks.js';
import { idempotencyKey } from '../helpers/idempotency.js';

/** Complete provider-backed billing, including actual ingress/worker reconciliation and replay. */
const vus = Number(__ENV.VUS || '4'),
  iterations = Number(__ENV.ITERATIONS || '5');
const completed = new Counter('billing_provider_journeys_completed');
export const options = {
  scenarios: { billing: { executor: 'per-vu-iterations', vus, iterations, maxDuration: '5m' } },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    dropped_iterations: ['count==0'],
    billing_provider_journeys_completed: [`count==${vus * iterations}`],
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
    credentialPool.length < vus * iterations + 1 ||
    __ENV.LOAD_PROVIDER_URL !== 'http://127.0.0.1:3006'
  )
    throw new Error('Distinct actors and loopback provider required');
  return {
    actors: Array.from(credentialPool).slice(0, vus * iterations),
    ...fixture('/setup'),
    foreignToken: mintTokenPool([credentialPool[vus * iterations]])[0].token,
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

export default function (data) {
  const actor = data.actors[(__VU - 1) * iterations + __ITER];
  const login = requireData(
    request('POST', '/auth/login', null, { email: actor.email, password: actor.password }),
    'billing owner',
  );
  const unique = `${__VU}-${__ITER}-${Date.now()}`;
  const organization = requireData(
    request('POST', '/tenancy/organizations', login.access_token, {
      name: `Provider team ${unique}`,
      slug: `load-provider-${unique}`,
    }),
    'billing team',
  );
  let token;
  try {
    token = requireData(
      request('POST', '/auth/switch-to-organization', login.access_token, {
        organization_id: organization.id,
      }),
      'billing scope',
    ).access_token;
    const key = idempotencyKey('subscription-replay'),
      body = { plan_id: data.plans[0], billing_cycle: 'monthly' };
    const subscription = requireData(
      request('POST', '/billing/subscriptions', token, body, 200, key),
      'subscription persisted',
    );
    assertCondition(
      subscription.status === 'INCOMPLETE' && subscription.plan_id === data.plans[0],
      'new subscription requires payment',
    );
    const replay = requireData(
      request('POST', '/billing/subscriptions', token, body, 200, key),
      'idempotent subscription replay',
    );
    assertCondition(replay.id === subscription.id, 'replay does not create another subscription');
    request('GET', `/billing/subscriptions/${subscription.id}`, data.foreignToken, null, 404);
    const payment = requireData(
      request('GET', `/billing/subscriptions/${subscription.id}/payment-setup`, token),
      'payment setup',
    );
    assertCondition(
      typeof payment.client_secret === 'string' && payment.client_secret.startsWith('pi_'),
      'payment setup references provider intent',
    );
    const setup = requireData(
      request('POST', '/billing/payment-methods/setup', token, {}),
      'payment-method setup',
    );
    assertCondition(
      typeof setup.client_secret === 'string' && setup.client_secret.startsWith('seti_'),
      'setup intent comes from provider',
    );
    assertCondition(
      fixture('/activate', { subscriptionId: subscription.id }).delivered === true,
      'signed activation event delivered',
    );
    let active;
    for (let attempt = 0; attempt < 60; attempt++) {
      active = requireData(
        request('GET', `/billing/subscriptions/${subscription.id}`, token),
        'worker reconciliation',
      );
      if (active.status === 'ACTIVE') break;
      assertCondition(active.status === 'INCOMPLETE', 'activation remains in known pending state');
      sleep(0.25);
    }
    assertCondition(active.status === 'ACTIVE', 'real worker persisted activation');
    verifyAccountReads({ subscriptionId: subscription.id, token, planId: data.plans[0] });
    const changed = requireData(
      request('POST', `/billing/subscriptions/${subscription.id}/change-plan`, token, {
        plan_id: data.plans[1],
      }),
      'changed plan',
    );
    assertCondition(changed.plan_id === data.plans[1], 'plan change persisted');
    const canceled = requireData(
      request('POST', `/billing/subscriptions/${subscription.id}/cancel`, token, {}),
      'period-end cancel',
    );
    assertCondition(canceled.cancel_at_period_end === true, 'cancel persisted');
    const resumed = requireData(
      request('POST', `/billing/subscriptions/${subscription.id}/resume`, token, {}),
      'resume',
    );
    assertCondition(resumed.cancel_at_period_end === false, 'resume persisted');
    assertCondition(
      fixture('/assert-subscription', { subscriptionId: subscription.id }).matched === true,
      'provider and database match',
    );
    const all = requireData(request('GET', '/billing/subscriptions', token), 'owned subscriptions');
    assertCondition(
      all.length === 1 && all[0].id === subscription.id,
      'no duplicate subscription after replay',
    );
    completed.add(1);
  } finally {
    request('POST', '/auth/step-up', token || login.access_token, { password: actor.password });
    request('DELETE', '/tenancy/organization', token || login.access_token, null, 204);
  }
}
