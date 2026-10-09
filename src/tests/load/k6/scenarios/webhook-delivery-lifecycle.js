import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { credentialPool, mintTokenPool, vuToken } from '../helpers/pool.js';
import { API_PREFIX } from '../helpers/config.js';
import { authHeaders } from '../helpers/auth.js';
import { assertCondition, requireData } from '../helpers/checks.js';
import { idempotencyKey } from '../helpers/idempotency.js';

/** Signed outbound delivery to a verifying local receiver, with unchanged production SSRF validation. */
const vus = Number(__ENV.VUS || '4'),
  iterations = Number(__ENV.ITERATIONS || '5');
const completed = new Counter('webhook_delivery_journeys_completed');
export const options = {
  scenarios: { deliveries: { executor: 'per-vu-iterations', vus, iterations, maxDuration: '2m' } },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    dropped_iterations: ['count==0'],
    webhook_delivery_journeys_completed: [`count==${vus * iterations}`],
    'http_req_duration{layer:backend}': ['p(95)<500'],
  },
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
    `receiver fixture ${path}`,
  );
}
function request(method, path, token, body, expected = 200) {
  const response = http.request(
    method,
    `${API_PREFIX}${path}`,
    body ? JSON.stringify(body) : null,
    {
      headers: { ...authHeaders(token).headers, 'X-Idempotency-Key': idempotencyKey('delivery') },
      tags: {
        name: `${method} ${path.replace(/wh_[a-z0-9]+/g, ':webhook_id')}`,
        route: path,
        layer: 'backend',
      },
      responseCallback: http.expectedStatuses(expected),
    },
  );
  assertCondition(response.status === expected, `${method} webhook: exact ${expected}`);
  return response;
}
export function setup() {
  if (__ENV.LOAD_PROVIDER_URL !== 'http://127.0.0.1:3006' || credentialPool.length < vus)
    throw new Error('Receiver fixture and distinct users required');
  return mintTokenPool(Array.from(credentialPool).slice(0, vus));
}
export default function (actors) {
  const actor = vuToken(actors),
    receiver = fixture('/receiver/create');
  // A local private URL must still be refused before any delivery is possible.
  request(
    'POST',
    '/notify/webhooks',
    actor.token,
    { url: 'http://127.0.0.1:3006/private', events: ['subscription.updated'] },
    400,
  );
  const created = requireData(
    request('POST', '/notify/webhooks', actor.token, {
      url: receiver.url,
      secret: receiver.secret,
      events: ['subscription.updated'],
      is_enabled: true,
    }),
    'owned webhook',
  );
  try {
    const forged = fixture(`/receiver/load-webhook/${receiver.id}`, {
      body: { event: 'webhook.test', data: { webhook_id: created.id } },
      headers: {
        'x-webhook-event': 'webhook.test',
        'x-webhook-signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`,
      },
    });
    assertCondition(forged.status === 401, 'receiver refuses forged signature');
    const delivery = requireData(
      request('POST', `/notify/webhooks/${created.id}/test`, actor.token, {}),
      'test delivery',
    );
    assertCondition(
      delivery.success === true && delivery.status_code === 200,
      'signed delivery succeeds',
    );
    const received = fixture('/receiver/status', { id: receiver.id }).deliveries;
    assertCondition(
      received.length === 1 &&
        received[0].signatureVerified === true &&
        received[0].timestampFresh === true &&
        received[0].webhookId === created.id,
      'receiver verified signature, freshness and resource identity',
    );
    const attempts = requireData(
      request('GET', `/notify/webhooks/${created.id}/delivery-attempts`, actor.token),
      'persisted delivery attempts',
    );
    assertCondition(
      attempts.length === 1 && attempts[0].http_status_code === 200,
      'one successful attempt persisted',
    );
    completed.add(1);
  } finally {
    request('DELETE', `/notify/webhooks/${created.id}`, actor.token, null, 204);
  }
}
