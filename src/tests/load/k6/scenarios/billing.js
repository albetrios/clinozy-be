import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { API_PREFIX, THRESHOLDS } from '../helpers/config.js';
import { assertCondition, requireData } from '../helpers/checks.js';
import { authHeaders } from '../helpers/auth.js';
import { credentialPool, mintTokenPool } from '../helpers/pool.js';

/** Billing read journey requires real plan/subscription fixtures and matching detail ids. */
const vus = Number(__ENV.VUS || '4');
const iterations = Number(__ENV.ITERATIONS || '5');
const completed = new Counter('billing_read_journeys_completed');
export const options = {
  scenarios: { billing: { executor: 'per-vu-iterations', vus, iterations, maxDuration: '2m' } },
  thresholds: {
    ...THRESHOLDS,
    checks: ['rate==1'],
    billing_read_journeys_completed: [`count==${vus * iterations}`],
  },
};
export function setup() {
  const first = credentialPool[0];
  const foreign = Array.from(credentialPool).find(
    (entry) => entry.organizationPublicId !== first.organizationPublicId,
  );
  assertCondition(Boolean(foreign), 'billing fixtures span multiple tenants');
  const actors = mintTokenPool([first, foreign]);
  const subscriptions = requireData(
    http.get(`${API_PREFIX}/billing/subscriptions`, {
      ...authHeaders(actors[1].token),
      tags: { name: 'foreign-billing-fixture' },
    }),
    'foreign-billing-fixture',
  );
  assertCondition(
    Array.isArray(subscriptions) && subscriptions.length > 0,
    'foreign subscription fixture present',
  );
  return { ...actors[0], foreignSubscriptionId: subscriptions[0].id };
}
export default function billingOps(actor) {
  const { headers } = authHeaders(actor.token);
  const plans = requireData(
    http.get(`${API_PREFIX}/billing/plans`, { headers, tags: { name: 'list-plans' } }),
    'list-plans',
  );
  assertCondition(Array.isArray(plans) && plans.length > 0, 'plan fixtures are present');
  const plan = requireData(
    http.get(`${API_PREFIX}/billing/plans/${plans[0].id}`, { headers, tags: { name: 'get-plan' } }),
    'get-plan',
  );
  assertCondition(plan.id === plans[0].id, 'plan detail matches requested public id');
  const subscriptions = requireData(
    http.get(`${API_PREFIX}/billing/subscriptions`, {
      headers,
      tags: { name: 'list-subscriptions' },
    }),
    'list-subscriptions',
  );
  assertCondition(
    Array.isArray(subscriptions) && subscriptions.length > 0,
    'subscription fixture is present',
  );
  const subscription = requireData(
    http.get(`${API_PREFIX}/billing/subscriptions/${subscriptions[0].id}`, {
      headers,
      tags: { name: 'get-subscription' },
    }),
    'get-subscription',
  );
  assertCondition(
    subscription.id === subscriptions[0].id &&
      subscription.plan_id === subscriptions[0].plan_id &&
      typeof subscription.seats_used === 'number',
    'subscription detail matches the owned list resource',
  );
  // Invoice/payment-method reads use live providers for bulk fake customer IDs.
  // Their provider-free collection shapes are exercised by read-surface instead.
  const denied = http.get(`${API_PREFIX}/billing/subscriptions/${actor.foreignSubscriptionId}`, {
    headers,
    tags: { name: 'foreign-subscription-denied' },
    responseCallback: http.expectedStatuses(404),
  });
  assertCondition(denied.status === 404, 'foreign subscription is not exposed');
  completed.add(1);
}
