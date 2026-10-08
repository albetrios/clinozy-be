import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { API_PREFIX, SMOKE_THRESHOLDS, PUBLIC_AUTH_FORM_HEADERS } from '../helpers/config.js';
import { checkStatus } from '../helpers/checks.js';

/**
 * k6 Scenario: session lifecycle — login → Bearer read → cookie refresh → read
 * with the rotated token → logout → refresh rejected.
 *
 * This is the platform's security-heaviest auth surface (httpOnly `session_id`
 * cookie + double-submit `csrf_token` + Origin checks) and no other scenario
 * touched `/auth/refresh` or `/auth/logout` at all. k6 keeps a per-VU cookie
 * jar, so the browser contract is exercised for real: login sets both cookies,
 * refresh rides the jar and mirrors the readable `csrf_token` cookie into
 * `X-CSRF-Token` (the SPA's double-submit), logout clears the session and the
 * final refresh MUST come back 401 — a load-visible proof that logout actually
 * revokes, not just deletes a cookie client-side.
 *
 * Credentials via `DEMO_EMAIL` / `DEMO_PASSWORD` (same defaults as login-smoke).
 */
export const options = {
  scenarios: {
    sessionRefreshJourney: {
      // Iteration-bounded on purpose: `/auth/refresh` carries REFRESH_RATE_LIMIT
      // (30 req / 60s per IP) and each iteration refreshes twice — a duration-based
      // smoke loop from one IP would trip the limiter it is not trying to test.
      executor: 'shared-iterations',
      vus: 1,
      iterations: 5,
      exec: 'sessionRefreshJourney',
    },
  },
  thresholds: {
    ...SMOKE_THRESHOLDS,
    checks: ['rate==1'],
    'http_reqs{name:session-journey-refresh-after-logout}': ['count==5'],
    'http_reqs{name:session-journey-me-after-logout}': ['count==5'],
    'http_req_duration{name:session-journey-login}': ['p(95)<800', 'p(99)<1200'],
    'http_req_duration{name:session-journey-refresh}': ['p(95)<500', 'p(99)<1000'],
    'http_req_duration{name:session-journey-me}': ['p(95)<500', 'p(99)<1000'],
  },
};

export function setup() {
  if (!(__ENV.DEMO_EMAIL && __ENV.DEMO_PASSWORD)) {
    throw new Error('Session journey requires explicit DEMO_EMAIL and DEMO_PASSWORD');
  }
}

export function sessionRefreshJourney() {
  const email = __ENV.DEMO_EMAIL;
  const password = __ENV.DEMO_PASSWORD;

  // 1) Login — sets the httpOnly session cookie + readable csrf_token cookie
  //    in this VU's jar and returns the short-lived Bearer token.
  const loginResponse = http.post(`${API_PREFIX}/auth/login`, JSON.stringify({ email, password }), {
    headers: PUBLIC_AUTH_FORM_HEADERS,
    tags: { name: 'session-journey-login' },
  });
  checkStatus(loginResponse, 200, 'session-journey login');
  if (loginResponse.status !== 200) fail('Session journey login failed');
  const accessToken = JSON.parse(loginResponse.body).data?.access_token;
  if (
    !check(accessToken, {
      'login returns access token': (token) => typeof token === 'string' && token.length > 0,
    })
  ) {
    fail('Login returned no access token');
  }

  // 2) Bearer read proves the minted token works.
  const meResponse = http.get(`${API_PREFIX}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    tags: { name: 'session-journey-me' },
  });
  checkStatus(meResponse, 200, 'session-journey me');

  // 3) Refresh — the jar sends session_id automatically; mirror the readable
  //    csrf_token cookie into X-CSRF-Token exactly as the SPA does (the
  //    double-submit contract; required in production when Origin is absent).
  const csrfCookie = findCookieValue('csrf_token');
  if (
    !check(csrfCookie, {
      'login sets CSRF cookie': (cookie) => typeof cookie === 'string' && cookie.length > 0,
    })
  ) {
    fail('Login did not set CSRF cookie');
  }
  const refreshResponse = http.post(`${API_PREFIX}/auth/refresh`, null, {
    headers: csrfCookie ? { 'X-CSRF-Token': csrfCookie } : {},
    tags: { name: 'session-journey-refresh' },
  });
  checkStatus(refreshResponse, 200, 'session-journey refresh');
  const refreshedToken =
    refreshResponse.status === 200 ? JSON.parse(refreshResponse.body).data?.access_token : null;

  if (
    !check(refreshedToken, {
      'refresh returns rotated access token': (token) =>
        typeof token === 'string' && token.length > 0,
    })
  ) {
    fail('Refresh returned no access token');
  }

  // 4) The ROTATED token must be live.
  if (refreshedToken) {
    const refreshedMeResponse = http.get(`${API_PREFIX}/users/me`, {
      headers: { Authorization: `Bearer ${refreshedToken}`, 'Content-Type': 'application/json' },
      tags: { name: 'session-journey-me' },
    });
    checkStatus(refreshedMeResponse, 200, 'session-journey me (refreshed token)');
  }

  // Preserve the CURRENT rotated cookies before logout clears the client jar.
  // Replaying them with matching CSRF reaches the session revocation check.
  const preservedSessionCookie = findCookieValue('session_id');
  const preservedCsrfCookie = findCookieValue('csrf_token');
  if (
    !check(
      { preservedSessionCookie, preservedCsrfCookie },
      {
        'refresh leaves valid session and CSRF cookies': (cookies) =>
          Boolean(cookies.preservedSessionCookie && cookies.preservedCsrfCookie),
      },
    )
  ) {
    fail('Cannot test revocation without preserved session cookies');
  }

  const logoutResponse = http.post(`${API_PREFIX}/auth/logout`, null, {
    headers: {
      Authorization: `Bearer ${refreshedToken || accessToken}`,
      'Content-Type': 'application/json',
    },
    tags: { name: 'session-journey-logout' },
  });
  checkStatus(logoutResponse, 200, 'session-journey logout');

  const refreshAfterLogoutResponse = http.post(`${API_PREFIX}/auth/refresh`, null, {
    headers: { 'X-CSRF-Token': preservedCsrfCookie },
    cookies: { session_id: preservedSessionCookie, csrf_token: preservedCsrfCookie },
    tags: { name: 'session-journey-refresh-after-logout' },
    // Missing cookies, failed CSRF and rate-limit rejection cannot prove revocation.
    responseCallback: http.expectedStatuses(401),
  });
  checkStatus(refreshAfterLogoutResponse, 401, 'preserved session is revoked after logout');
  check(refreshAfterLogoutResponse, {
    'revoked refresh returns JSON error and no access token': (response) => {
      try {
        const body = JSON.parse(response.body);
        return Boolean(body.error) && !body.data?.access_token;
      } catch {
        return false;
      }
    },
  });

  const meAfterLogoutResponse = http.get(`${API_PREFIX}/users/me`, {
    headers: { Authorization: `Bearer ${refreshedToken}` },
    tags: { name: 'session-journey-me-after-logout' },
    responseCallback: http.expectedStatuses(401),
  });
  checkStatus(meAfterLogoutResponse, 401, 'access token is revoked after logout');

  // Fresh session per iteration: clear the jar so the next loop's login starts clean.
  http.cookieJar().clear(`${API_PREFIX}`);
  sleep(1);
}

/** Reads a cookie value from this VU's jar for the API origin (null when absent). */
function findCookieValue(cookieName) {
  const cookiesForApiOrigin = http.cookieJar().cookiesForURL(`${API_PREFIX}/auth/refresh`);
  const values = cookiesForApiOrigin[cookieName];
  return values && values.length > 0 ? values[0] : null;
}
