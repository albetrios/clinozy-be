import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { API_PREFIX, PUBLIC_AUTH_FORM_HEADERS } from '../helpers/config.js';
import { assertCondition, requireData } from '../helpers/checks.js';
import { credentialPool } from '../helpers/pool.js';
import { totpCode } from '../helpers/totp.js';

/** Distinct real accounts: session revocation, password changes, linked methods and full MFA ceremony. */
const VUS = Number(__ENV.VUS || '4');
const ITERATIONS = Number(__ENV.ITERATIONS || '1');
const completed = new Counter('auth_security_journeys_completed');
export const options = {
  scenarios: {
    lifecycle: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: '5m',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    dropped_iterations: ['count==0'],
    auth_security_journeys_completed: [`count==${VUS * ITERATIONS}`],
    'http_req_duration{phase:read}': ['p(95)<500', 'p(99)<1000'],
    'http_req_duration{phase:credential}': ['p(95)<1500', 'p(99)<2500'],
  },
};
export function setup() {
  if (
    !Number.isInteger(VUS) ||
    VUS < 1 ||
    !Number.isInteger(ITERATIONS) ||
    ITERATIONS < 1 ||
    credentialPool.length < VUS * ITERATIONS
  )
    throw new Error('Distinct credential required for every complete journey');
  return Array.from(credentialPool).slice(0, VUS * ITERATIONS);
}
function request(method, path, token, body, expected = 200, phase = 'credential') {
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
        name: `${method} ${path.replace(/\/(?:asm|ses)_[a-z0-9]+/g, '/:id')}`,
        phase,
      },
      responseCallback: http.expectedStatuses(expected),
    },
  );
  assertCondition(
    response.status === expected,
    `${method} ${path.split('/').slice(0, 4).join('/')}: exact ${expected}`,
  );
  return response;
}
function login(credential, password = credential.password) {
  return requireData(
    request('POST', '/auth/login', null, { email: credential.email, password }),
    'password login',
  );
}
function verifySessionRevocations({ credential, primary, token }) {
  const secondary = login(credential);
  request('DELETE', `/auth/me/sessions/${secondary.session_id}`, token, null, 403);
  requireData(
    request('POST', '/auth/step-up', token, { password: credential.password }),
    'password step-up',
  );
  request('DELETE', `/auth/me/sessions/${secondary.session_id}`, token, null, 204);
  request('GET', '/users/me', secondary.access_token, null, 401, 'read');
  const third = login(credential);
  request('DELETE', '/auth/me/sessions', token, null, 204);
  request('GET', '/users/me', third.access_token, null, 401, 'read');
  const remaining = requireData(
    request('GET', '/auth/me/sessions', token, null, 200, 'read'),
    'remaining sessions',
  );
  assertCondition(
    remaining.length === 1 && remaining[0].id === primary.session_id,
    'bulk revoke retains exactly current session',
  );
}

function verifyLinkedMethod({ token, state }) {
  const method = requireData(
    request('POST', '/auth/me/auth-methods', token, { method_type: 'EMAIL_CODE' }),
    'linked method',
  );
  state.linkedMethod = method.id;
  const methods = requireData(
    request('GET', '/auth/me/auth-methods', token, null, 200, 'read'),
    'linked methods persisted',
  );
  assertCondition(
    methods.some((row) => row.id === state.linkedMethod && row.method_type === 'EMAIL_CODE'),
    'linked method is listed',
  );
  assertCondition(
    !methods.some((row) => 'encrypted_secret' in row || 'user_id' in row),
    'credential material omitted',
  );
  request('DELETE', `/auth/me/auth-methods/${state.linkedMethod}`, token, null, 204);
  const afterDelete = requireData(
    request('GET', '/auth/me/auth-methods', token, null, 200, 'read'),
    'linked method removed',
  );
  assertCondition(
    !afterDelete.some((row) => row.id === state.linkedMethod),
    'linked method absent',
  );
  state.linkedMethod = null;
}

function verifyPasswordChanges({ token, credential, nextPassword, state }) {
  request(
    'POST',
    '/auth/password/change',
    token,
    { current_password: credential.password, new_password: nextPassword },
    200,
  );
  state.changedPassword = true;
  request(
    'POST',
    '/auth/login',
    null,
    { email: credential.email, password: credential.password },
    401,
  );
  const changedLogin = login(credential, nextPassword);
  assertCondition(Boolean(changedLogin.access_token), 'new password actually authenticates');
  requireData(
    request('POST', '/auth/step-up', token, { password: nextPassword }),
    'step-up new password',
  );
  request(
    'POST',
    '/auth/password/change',
    token,
    { current_password: nextPassword, new_password: credential.password },
    200,
  );
  state.changedPassword = false;
  request('GET', '/users/me', changedLogin.access_token, null, 401, 'read');
}

function verifyMfaLifecycle({ token, credential, state }) {
  const enrollment = requireData(
    request('POST', '/auth/me/mfa/enroll', token, { method_type: 'MFA_TOTP' }),
    'MFA init',
  );
  assertCondition(
    typeof enrollment.secret === 'string' && enrollment.provisioning_uri.startsWith('otpauth://'),
    'authenticator enrollment returned',
  );
  const code = totpCode(enrollment.secret);
  const confirmation = requireData(
    request('POST', '/auth/me/mfa/enroll/confirm', token, { code }),
    'MFA confirm',
  );
  state.mfaMethod = confirmation.mfa_method_id;
  assertCondition(
    Boolean(state.mfaMethod) && confirmation.recovery_codes.length > 1,
    'MFA factor and recovery codes issued',
  );
  const factors = requireData(request('GET', '/auth/me/mfa', token, null, 200, 'read'), 'MFA list');
  assertCondition(
    factors.some((row) => row.id === state.mfaMethod),
    'MFA factor persisted',
  );
  request('POST', '/auth/me/mfa/verify', token, { code }, 401);
  // Use the next real authenticator interval: a consumed enrollment code must never be reused.
  sleep((30000 - (Date.now() % 30000) + 100) / 1000);
  const freshCode = totpCode(enrollment.secret);
  const verified = requireData(
    request('POST', '/auth/me/mfa/verify', token, { code: freshCode }),
    'MFA step-up',
  );
  assertCondition(verified.verified === true, 'MFA step-up verified');
  request('POST', '/auth/me/mfa/verify', token, { code: freshCode }, 401);
  const challenge = login(credential);
  assertCondition(
    challenge.mfa_required === true &&
      !challenge.access_token &&
      Boolean(challenge.mfa_session_token),
    'password alone cannot bypass MFA',
  );
  const secondFactor = requireData(
    request('POST', '/auth/mfa/login', null, {
      mfa_session_token: challenge.mfa_session_token,
      recovery_code: confirmation.recovery_codes[0],
    }),
    'MFA login',
  );
  assertCondition(Boolean(secondFactor.access_token), 'second factor grants session');
  const replayChallenge = login(credential);
  request(
    'POST',
    '/auth/mfa/login',
    null,
    {
      mfa_session_token: replayChallenge.mfa_session_token,
      recovery_code: confirmation.recovery_codes[0],
    },
    401,
  );
  request('DELETE', `/auth/me/mfa/${state.mfaMethod}`, token, null, 204);
  const cleared = requireData(
    request('GET', '/auth/me/mfa', token, null, 200, 'read'),
    'MFA cleared',
  );
  assertCondition(
    !cleared.some((row) => row.id === state.mfaMethod),
    'MFA factor absent after removal',
  );
  state.mfaMethod = null;
  const restored = login(credential);
  assertCondition(
    Boolean(restored.access_token) && !restored.mfa_required,
    'original password login restored without MFA',
  );
  request('POST', '/auth/logout', restored.access_token, null, 200);
}

export default function (credentials) {
  const credential = credentials[(__VU - 1) * ITERATIONS + __ITER];
  sleep((__VU - 1) * 0.05);
  const primary = login(credential);
  assertCondition(Boolean(primary.access_token && primary.session_id), 'real session issued');
  const token = primary.access_token;
  const originalProfile = requireData(
    request('GET', '/users/me', token, null, 200, 'read'),
    'owned profile',
  );
  assertCondition(
    originalProfile.id === credential.userPublicId && !originalProfile.is_mfa_enabled,
    'distinct non-MFA fixture',
  );

  const state = { linkedMethod: null, mfaMethod: null, changedPassword: false };
  const nextPassword = `${credential.password}Load7!`;
  try {
    verifySessionRevocations({ credential, primary, token });
    verifyLinkedMethod({ token, state });
    verifyPasswordChanges({ token, credential, nextPassword, state });
    verifyMfaLifecycle({ token, credential, state });
    completed.add(1);
  } finally {
    if (state.mfaMethod) request('DELETE', `/auth/me/mfa/${state.mfaMethod}`, token, null, 204);
    if (state.linkedMethod)
      request('DELETE', `/auth/me/auth-methods/${state.linkedMethod}`, token, null, 204);
    if (state.changedPassword) {
      requireData(
        request('POST', '/auth/step-up', token, { password: nextPassword }),
        'restore password step-up',
      );
      request(
        'POST',
        '/auth/password/change',
        token,
        { current_password: nextPassword, new_password: credential.password },
        200,
      );
    }
  }
}
