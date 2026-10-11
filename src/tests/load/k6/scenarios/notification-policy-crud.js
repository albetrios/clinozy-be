import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { API_PREFIX, THRESHOLDS } from '../helpers/config.js';
import { assertCondition, requireData, requireScopedCredentials } from '../helpers/checks.js';
import { authHeaders } from '../helpers/auth.js';
import { idempotencyKey } from '../helpers/idempotency.js';

/** Owns an unused policy pair per VU; conflicts fail rather than skipping the lifecycle. */
const NOTIFICATION_TYPES = [
  'system.welcome',
  'system.maintenance',
  'security.alert',
  'billing.usage_threshold',
  'billing.payment_succeeded',
  'billing.payment_failed',
  'membership.invite_accepted',
  'subscription.updated',
  'webhook.delivery_failed',
];
const CHANNELS = ['EMAIL', 'SMS', 'WEB_PUSH', 'IN_APP'];

const vus = Number(__ENV.VUS || '4');
const iterations = Number(__ENV.ITERATIONS || '5');
const completed = new Counter('policy_journeys_completed');
export const options = {
  scenarios: { policies: { executor: 'per-vu-iterations', vus, iterations, maxDuration: '2m' } },
  thresholds: {
    ...THRESHOLDS,
    checks: ['rate==1'],
    policy_journeys_completed: [`count==${vus * iterations}`],
  },
};
export function setup() {
  requireScopedCredentials();
  const existing = requireData(
    http.get(`${API_PREFIX}/tenancy/organization/notification-policies`, {
      ...authHeaders(__ENV.TEST_TOKEN),
      tags: { name: 'list-notification-policies' },
    }),
    'list-notification-policies',
  );
  assertCondition(Array.isArray(existing), 'policies are an array');
  const available = [];
  for (const type of NOTIFICATION_TYPES)
    for (const channel of CHANNELS) {
      if (
        !existing.some((policy) => policy.notification_type === type && policy.channel === channel)
      )
        available.push({ notification_type: type, channel });
    }
  assertCondition(available.length >= vus, 'enough unused policy pairs for every VU');
  return available.slice(0, vus);
}
export default function notificationPolicyCrudOps(pairs) {
  const { headers } = authHeaders(__ENV.TEST_TOKEN);
  const pair = pairs[__VU - 1];
  let id;
  let deleted = false;
  try {
    const created = requireData(
      http.post(
        `${API_PREFIX}/tenancy/organization/notification-policies`,
        JSON.stringify({ ...pair, default_enabled: true }),
        {
          headers: { ...headers, 'X-Idempotency-Key': idempotencyKey('policy') },
          tags: { name: 'create-notification-policy' },
        },
      ),
      'create-notification-policy',
    );
    id = created.id;
    assertCondition(typeof id === 'string', 'policy resource id');
    const detail = requireData(
      http.get(`${API_PREFIX}/tenancy/organization/notification-policies/${id}`, {
        headers,
        tags: { name: 'get-notification-policy' },
      }),
      'get-notification-policy',
    );
    assertCondition(
      detail.organization_id === __ENV.TEST_ORG_ID &&
        detail.default_enabled === true &&
        detail.notification_type === pair.notification_type &&
        detail.channel === pair.channel,
      'created policy belongs to tenant with correct pair',
    );
    requireData(
      http.patch(
        `${API_PREFIX}/tenancy/organization/notification-policies/${id}`,
        JSON.stringify({ default_enabled: false }),
        { headers, tags: { name: 'update-notification-policy' } },
      ),
      'update-notification-policy',
    );
    const updated = requireData(
      http.get(`${API_PREFIX}/tenancy/organization/notification-policies/${id}`, {
        headers,
        tags: { name: 'updated-notification-policy' },
      }),
      'updated-notification-policy',
    );
    assertCondition(
      updated.id === id && updated.default_enabled === false,
      'policy update persisted',
    );
    assertCondition(
      http.del(`${API_PREFIX}/tenancy/organization/notification-policies/${id}`, null, {
        headers,
        tags: { name: 'delete-notification-policy' },
      }).status === 204,
      'policy deleted',
    );
    deleted = true;
    const absent = http.get(`${API_PREFIX}/tenancy/organization/notification-policies/${id}`, {
      headers,
      tags: { name: 'deleted-notification-policy' },
      responseCallback: http.expectedStatuses(404),
    });
    assertCondition(absent.status === 404, 'deleted policy absent');
    completed.add(1);
  } finally {
    if (id && !deleted)
      assertCondition(
        http.del(`${API_PREFIX}/tenancy/organization/notification-policies/${id}`, null, {
          headers,
          tags: { name: 'cleanup-policy' },
        }).status === 204,
        'policy failure cleanup',
      );
  }
}
