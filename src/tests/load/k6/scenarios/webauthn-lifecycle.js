import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { credentialPool } from '../helpers/pool.js';
import { API_PREFIX, PUBLIC_AUTH_FORM_HEADERS } from '../helpers/config.js';
import { assertCondition, requireData } from '../helpers/checks.js';

/** Real registration and signed assertion verification using a loopback virtual authenticator. */
const VUS = Number(__ENV.VUS || '4');
const ITERATIONS = Number(__ENV.ITERATIONS || '5');
const completed = new Counter('webauthn_journeys_completed');
const origin = 'http://localhost:5173';
export const options = {
  scenarios: { passkeys: { executor: 'per-vu-iterations', vus: VUS, iterations: ITERATIONS } },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    dropped_iterations: ['count==0'],
    webauthn_journeys_completed: [`count==${VUS * ITERATIONS}`],
    http_req_duration: ['p(95)<800', 'p(99)<1200'],
  },
};
export function setup() {
  if (
    credentialPool.length < VUS * ITERATIONS ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(__ENV.LOAD_AUTHENTICATOR_URL || '') ||
    !__ENV.LOAD_AUTHENTICATOR_TOKEN
  )
    throw new Error('Distinct actors and authorized loopback authenticator required');
  return Array.from(credentialPool).slice(0, VUS * ITERATIONS);
}
function request(method, path, token, body, expected = 200) {
  const response = http.request(
    method,
    `${API_PREFIX}${path}`,
    body ? JSON.stringify(body) : null,
    {
      headers: {
        ...PUBLIC_AUTH_FORM_HEADERS,
        Origin: origin,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      tags: { name: `${method} ${path.replace(/wac_[a-z0-9]+/g, ':credential_id')}`, route: path },
      responseCallback: http.expectedStatuses(expected),
    },
  );
  assertCondition(
    response.status === expected,
    `${method} ${path.split('/').slice(0, 4).join('/')}: exact ${expected}`,
  );
  return response;
}
function authenticator(path, body) {
  return requireData(
    http.post(`${__ENV.LOAD_AUTHENTICATOR_URL}${path}`, JSON.stringify({ ...body, origin }), {
      headers: {
        Authorization: `Bearer ${__ENV.LOAD_AUTHENTICATOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'fixture-authenticator', fixture: 'authenticator' },
    }),
    'virtual authenticator response',
  );
}
export default function (actors) {
  const actor = actors[(__VU - 1) * ITERATIONS + __ITER];
  const token = requireData(
    request('POST', '/auth/login', null, { email: actor.email, password: actor.password }),
    'password login',
  ).access_token;
  requireData(
    request('POST', '/auth/step-up', token, { password: actor.password }),
    'real step-up',
  );
  const options = requireData(
    request('POST', '/auth/me/webauthn/register/options', token, {}),
    'registration challenge',
  );
  const response = authenticator('/register', { options: options.options });
  let identifier;
  try {
    const registered = requireData(
      request('POST', '/auth/me/webauthn/register/verify', token, {
        challenge_token: options.challenge_token,
        response,
      }),
      'verified real registration',
    );
    identifier = registered.credential_id;
    assertCondition(
      registered.verified === true && /^wac_[a-z0-9]{21}$/.test(identifier),
      'real credential persisted',
    );
    request(
      'POST',
      '/auth/me/webauthn/register/verify',
      token,
      { challenge_token: options.challenge_token, response },
      401,
    );
    const list = requireData(
      request('GET', '/auth/me/webauthn/credentials', token),
      'credential list',
    );
    assertCondition(
      list.some((row) => row.id === identifier) &&
        list.every((row) => !(row.public_key || row.credential_id)),
      'list persists owned credential without key material',
    );
    const challenge = requireData(
      request('POST', '/auth/webauthn/authenticate/options', null, { email: actor.email }),
      'assertion challenge',
    );
    const assertion = authenticator('/authenticate', {
      options: challenge.options,
      credentialId: response.id,
    });
    const authenticated = requireData(
      request('POST', '/auth/webauthn/authenticate/verify', null, {
        challenge_token: challenge.challenge_token,
        response: assertion,
      }),
      'real signed authentication',
    );
    assertCondition(Boolean(authenticated.access_token), 'passkey grants a session');
    const profile = requireData(
      request('GET', '/users/me', authenticated.access_token),
      'passkey session identity',
    );
    assertCondition(profile.id === actor.userPublicId, 'passkey session bound to owner');
    request(
      'POST',
      '/auth/webauthn/authenticate/verify',
      null,
      { challenge_token: challenge.challenge_token, response: assertion },
      401,
    );
    request('DELETE', `/auth/me/webauthn/credentials/${identifier}`, token, null, 204);
    identifier = null;
    const after = requireData(
      request('GET', '/auth/me/webauthn/credentials', token),
      'removed credential',
    );
    assertCondition(
      !after.some((row) => row.id === registered.credential_id),
      'revoked credential absent',
    );
    completed.add(1);
  } finally {
    if (identifier)
      request('DELETE', `/auth/me/webauthn/credentials/${identifier}`, token, null, 204);
    authenticator('/delete', { credentialId: response.id });
  }
}
