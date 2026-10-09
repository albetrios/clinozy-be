import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { API_PREFIX, THRESHOLDS } from '../helpers/config.js';
import { assertCondition, requireData, requireScopedCredentials } from '../helpers/checks.js';
import { authHeaders } from '../helpers/auth.js';
import { idempotencyKey } from '../helpers/idempotency.js';

/** Owned webhook CRUD without outbound test delivery. Use WEBHOOK_URL_ALLOWLIST=example.com. */
const target = __ENV.WEBHOOK_TEST_BASE_URL || 'https://example.com';
const vus = Number(__ENV.VUS || '4');
const iterations = Number(__ENV.ITERATIONS || '5');
const completed = new Counter('webhook_journeys_completed');
export const options = {
  scenarios: { webhooks: { executor: 'per-vu-iterations', vus, iterations, maxDuration: '2m' } },
  thresholds: {
    ...THRESHOLDS,
    checks: ['rate==1'],
    webhook_journeys_completed: [`count==${vus * iterations}`],
  },
};
export function setup() {
  requireScopedCredentials();
}
export default function webhookOps() {
  const { headers } = authHeaders(__ENV.TEST_TOKEN);
  let id;
  let deleted = false;
  try {
    const created = requireData(
      http.post(
        `${API_PREFIX}/notify/webhooks`,
        JSON.stringify({
          url: `${target}/k6-owned-${__VU}-${__ITER}-${Date.now()}`,
          events: ['subscription.updated'],
          is_enabled: true,
        }),
        {
          headers: { ...headers, 'X-Idempotency-Key': idempotencyKey('webhook') },
          tags: { name: 'create-webhook' },
        },
      ),
      'create-webhook',
    );
    id = created.id;
    assertCondition(typeof id === 'string', 'webhook resource id');
    const before = requireData(
      http.get(`${API_PREFIX}/notify/webhooks/${id}`, { headers, tags: { name: 'get-webhook' } }),
      'get-webhook',
    );
    assertCondition(
      before.id === id &&
        before.is_enabled === true &&
        before.encrypted_secret === undefined &&
        before.secret === undefined,
      'created webhook without leaked signing material',
    );
    requireData(
      http.patch(`${API_PREFIX}/notify/webhooks/${id}`, JSON.stringify({ is_enabled: false }), {
        headers,
        tags: { name: 'update-webhook' },
      }),
      'update-webhook',
    );
    const updated = requireData(
      http.get(`${API_PREFIX}/notify/webhooks/${id}`, {
        headers,
        tags: { name: 'updated-webhook' },
      }),
      'updated-webhook',
    );
    assertCondition(
      updated.id === id && updated.is_enabled === false,
      'webhook disabled persistently',
    );
    const attempts = requireData(
      http.get(`${API_PREFIX}/notify/webhooks/${id}/delivery-attempts`, {
        headers,
        tags: { name: 'list-webhook-delivery-attempts' },
      }),
      'list-webhook-delivery-attempts',
    );
    assertCondition(
      Array.isArray(attempts) && attempts.length === 0,
      'CRUD did not send an outbound delivery',
    );
    assertCondition(
      http.del(`${API_PREFIX}/notify/webhooks/${id}`, null, {
        headers,
        tags: { name: 'delete-webhook' },
      }).status === 204,
      'webhook deleted',
    );
    deleted = true;
    const absent = http.get(`${API_PREFIX}/notify/webhooks/${id}`, {
      headers,
      tags: { name: 'deleted-webhook' },
      responseCallback: http.expectedStatuses(404),
    });
    assertCondition(absent.status === 404, 'deleted webhook absent');
    completed.add(1);
  } finally {
    if (id && !deleted)
      assertCondition(
        http.del(`${API_PREFIX}/notify/webhooks/${id}`, null, {
          headers,
          tags: { name: 'cleanup-webhook' },
        }).status === 204,
        'webhook failure cleanup',
      );
  }
}
