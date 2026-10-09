import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { API_PREFIX, PUBLIC_AUTH_FORM_HEADERS } from '../helpers/config.js';
import { assertCondition, requireData } from '../helpers/checks.js';

/** Real elevated session; admin reads and mutations apply only to fresh disposable target users. */
const VUS = Number(__ENV.VUS || '4');
const ITERATIONS = Number(__ENV.ITERATIONS || '5');
const completed = new Counter('admin_journeys_completed');
export const options = {
  scenarios: {
    admin: { executor: 'per-vu-iterations', vus: VUS, iterations: ITERATIONS, maxDuration: '10m' },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    dropped_iterations: ['count==0'],
    admin_journeys_completed: [`count==${VUS * ITERATIONS}`],
    http_req_duration: ['p(95)<800', 'p(99)<1200'],
  },
};
function request(method, path, token, body, expected = 200) {
  const response = http.request(
    method,
    `${API_PREFIX}${path}`,
    body ? JSON.stringify(body) : null,
    {
      headers: {
        ...PUBLIC_AUTH_FORM_HEADERS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      tags: {
        route: path.split('?')[0],
        name: `${method} ${path.replace(/\/usr_[a-z0-9]+/g, '/:user_id')}`,
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
  const tokens = __ENV.ADMIN_TOKENS ? JSON.parse(__ENV.ADMIN_TOKENS) : [__ENV.ADMIN_TOKEN];
  if (tokens.length < VUS || tokens.some((token) => !token))
    throw new Error('Distinct real admin session required per VU');
  if (ITERATIONS > 5)
    throw new Error('Maximum five destructive operations per admin in five minutes');
  for (const token of tokens) {
    const context = requireData(request('GET', '/auth/me/context', token), 'admin context');
    assertCondition(context.global_role === 'super_admin', 'session has real super-admin role');
  }
  return tokens;
}
export default function (tokens) {
  const token = tokens[__VU - 1];
  const email = `load-admin-target-${__VU}-${__ITER}-${Date.now()}@loadtest.example.com`;
  const sent = requireData(
    request('POST', '/auth/email/send-code', null, { email }),
    'create admin target',
  );
  const targetLogin = requireData(
    request('POST', '/auth/email/login', null, { email, code: sent.debug_verification_code }),
    'target login',
  );
  const target = requireData(
    request('GET', '/users/me', targetLogin.access_token),
    'target identity',
  );
  let deleted = false;
  try {
    request('GET', '/users', targetLogin.access_token, null, 403);
    const users = requireData(
      request('GET', `/users?search=${encodeURIComponent(email)}`, token),
      'admin users list',
    );
    assertCondition(
      users.some((row) => row.id === target.id),
      'new target appears in admin list',
    );
    const detail = requireData(request('GET', `/users/${target.id}`, token), 'admin user detail');
    assertCondition(
      detail.id === target.id && detail.email === email,
      'detail belongs to new target',
    );
    requireData(
      request('PATCH', `/users/${target.id}`, token, { first_name: 'Load admin updated' }),
      'admin edit',
    );
    const readback = requireData(
      request('GET', '/users/me', targetLogin.access_token),
      'admin edit readback',
    );
    assertCondition(readback.first_name === 'Load admin updated', 'admin edit actually persisted');
    const logs = requireData(request('GET', '/audit/logs', token), 'global audit logs');
    assertCondition(Array.isArray(logs) && logs.length > 0, 'global audit has persisted rows');
    request('GET', '/audit/logs', targetLogin.access_token, null, 403);
    request('DELETE', `/users/${target.id}`, token, null, 204);
    deleted = true;
    request('GET', '/users/me', targetLogin.access_token, null, 401);
    request('GET', `/users/${target.id}`, token, null, 404);
    completed.add(1);
  } finally {
    if (!deleted) request('DELETE', `/users/${target.id}`, token, null, 204);
  }
}
