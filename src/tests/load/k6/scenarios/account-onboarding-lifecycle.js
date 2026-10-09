import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { API_PREFIX, PUBLIC_AUTH_FORM_HEADERS } from '../helpers/config.js';
import { mailToken, requireMailbox } from '../helpers/mailbox.js';
import { assertCondition, requireData } from '../helpers/checks.js';

/** Real one-time email codes, idempotent onboarding and deletion of only newly created accounts. */
const VUS = Number(__ENV.VUS || '4');
const ITERATIONS = Number(__ENV.ITERATIONS || '5');
const completed = new Counter('account_journeys_completed');
export const options = {
  scenarios: { accounts: { executor: 'per-vu-iterations', vus: VUS, iterations: ITERATIONS } },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    dropped_iterations: ['count==0'],
    account_journeys_completed: [`count==${VUS * ITERATIONS}`],
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
      tags: { route: path.split('?')[0], name: `${method} ${path}` },
      responseCallback: http.expectedStatuses(expected),
    },
  );
  assertCondition(response.status === expected, `${method} ${path}: exact ${expected}`);
  return response;
}
export function setup() {
  requireMailbox();
}
export default function () {
  const email = `load-onboarding-${__VU}-${__ITER}-${Date.now()}@loadtest.example.com`;
  const sent = requireData(
    request('POST', '/auth/email/send-code', null, { email }),
    'send real code',
  );
  assertCondition(
    typeof sent.debug_verification_code === 'string',
    'TEST_MODE returned a real verification code',
  );
  const authenticated = requireData(
    request('POST', '/auth/email/login', null, { email, code: sent.debug_verification_code }),
    'redeem code',
  );
  assertCondition(Boolean(authenticated.access_token), 'redeemed code grants session');
  let token = authenticated.access_token;
  let deleted = false;
  try {
    const settings = requireData(
      request('GET', '/users/me/settings', token),
      'new account settings',
    );
    assertCondition(settings && typeof settings === 'object', 'settings returned for new account');
    const profile = requireData(request('GET', '/users/me', token), 'new profile');
    requireData(
      request('POST', '/auth/password/forgot', null, { email }),
      'password reset requested',
    );
    const resetToken = mailToken({ email });
    const password = 'LoadAccountPassword9!';
    const reset = requireData(
      request('POST', '/auth/password/reset', null, { token: resetToken, password }),
      'password reset',
    );
    assertCondition(Boolean(reset.access_token), 'reset grants real new session');
    request('GET', '/users/me', token, null, 401);
    token = reset.access_token;
    request('POST', '/auth/password/reset', null, { token: resetToken, password }, 401);
    const passwordLogin = requireData(
      request('POST', '/auth/login', null, { email, password }),
      'reset password authenticates',
    );
    assertCondition(Boolean(passwordLogin.access_token), 'stored reset password works');

    assertCondition(profile.email === email && Boolean(profile.id), 'new account identity matches');
    request('POST', '/auth/email/login', null, { email, code: sent.debug_verification_code }, 401);
    const complete = requireData(
      request('POST', '/users/me/onboarding/complete', token),
      'complete onboarding',
    );
    assertCondition(complete.onboarding_completed === true, 'completion flag persisted');
    const repeated = requireData(
      request('POST', '/users/me/onboarding/complete', token),
      'repeat onboarding',
    );
    assertCondition(repeated.onboarding_completed === true, 'onboarding completion is idempotent');
    const readback = requireData(request('GET', '/users/me', token), 'onboarding readback');
    assertCondition(readback.onboarding_completed === true, 'onboarding readback matches');
    const exported = requireData(
      request('POST', '/users/me/data-export', token, {}),
      'request data export',
    );
    assertCondition(Boolean(exported.id), 'export has real identifier');
    const status = requireData(
      request('GET', `/users/me/data-export/${exported.id}`, token),
      'export status',
    );
    assertCondition(
      status.id === exported.id && ['pending', 'processing', 'completed'].includes(status.status),
      'export status belongs to requested record',
    );
    request('DELETE', '/users/me', token, null, 204);
    deleted = true;
    request('GET', '/users/me', token, null, 401);
    completed.add(1);
  } finally {
    if (!deleted) request('DELETE', '/users/me', token, null, 204);
  }
}
