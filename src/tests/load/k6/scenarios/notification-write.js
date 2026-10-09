import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { API_PREFIX, THRESHOLDS } from '../helpers/config.js';
import { assertCondition, requireData } from '../helpers/checks.js';
import { authHeaders } from '../helpers/auth.js';
import { credentialPool, mintTokenPool, vuToken } from '../helpers/pool.js';

/** One distinct seeded user per VU: read, persisted read marking, mark-all and owned deletion. */
const vus = Number(__ENV.VUS || '20');
const completed = new Counter('notification_journeys_completed');
export const options = {
  scenarios: {
    notifications: { executor: 'per-vu-iterations', vus, iterations: 1, maxDuration: '2m' },
  },
  thresholds: {
    ...THRESHOLDS,
    checks: ['rate==1'],
    notification_journeys_completed: [`count==${vus}`],
  },
  setupTimeout: '3m',
};
export function setup() {
  assertCondition(credentialPool.length >= vus, 'enough distinct notification users');
  return mintTokenPool(Array.from(credentialPool).slice(0, vus));
}
export default function notificationWriteOps(pool) {
  const { token } = vuToken(pool);
  const { headers } = authHeaders(token);
  const list = requireData(
    http.get(`${API_PREFIX}/notify/notifications?limit=100`, {
      headers,
      tags: { name: 'notification-write-list' },
    }),
    'notification-write-list',
  );
  assertCondition(
    Array.isArray(list) && list.some((item) => item.is_read === false),
    'seeded unread notification is present',
  );
  const target = list.find((item) => item.is_read === false);
  const before = requireData(
    http.get(`${API_PREFIX}/notify/notifications/unread-count`, {
      headers,
      tags: { name: 'notification-unread-before' },
    }),
    'notification-unread-before',
  );
  requireData(
    http.get(`${API_PREFIX}/notify/notifications/${target.id}`, {
      headers,
      tags: { name: 'notification-detail' },
    }),
    'notification-detail',
  );
  requireData(
    http.patch(`${API_PREFIX}/notify/notifications/${target.id}/read`, JSON.stringify({}), {
      headers,
      tags: { name: 'notification-mark-read' },
    }),
    'notification-mark-read',
  );
  const updated = requireData(
    http.get(`${API_PREFIX}/notify/notifications/${target.id}`, {
      headers,
      tags: { name: 'notification-readback' },
    }),
    'notification-readback',
  );
  assertCondition(
    updated.is_read === true && typeof updated.read_at === 'string',
    'notification read persisted with timestamp',
  );
  const after = requireData(
    http.get(`${API_PREFIX}/notify/notifications/unread-count`, {
      headers,
      tags: { name: 'notification-unread-after' },
    }),
    'notification-unread-after',
  );
  assertCondition(after.count === before.count - 1, 'unread count reflects exactly one read');
  requireData(
    http.post(`${API_PREFIX}/notify/notifications/mark-all-read`, null, {
      headers,
      tags: { name: 'mark-all-read' },
    }),
    'mark-all-read',
  );
  const allRead = requireData(
    http.get(`${API_PREFIX}/notify/notifications/unread-count`, {
      headers,
      tags: { name: 'notification-unread-zero' },
    }),
    'notification-unread-zero',
  );
  assertCondition(allRead.count === 0, 'mark-all-read persisted zero unread count');
  assertCondition(
    http.del(`${API_PREFIX}/notify/notifications/${target.id}`, null, {
      headers,
      tags: { name: 'notification-delete' },
    }).status === 204,
    'owned notification deleted',
  );
  const absent = http.get(`${API_PREFIX}/notify/notifications/${target.id}`, {
    headers,
    tags: { name: 'deleted-notification' },
    responseCallback: http.expectedStatuses(404),
  });
  assertCondition(absent.status === 404, 'deleted notification absent');
  completed.add(1);
}
