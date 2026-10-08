import http from 'k6/http';
import { API_PREFIX, PUBLIC_AUTH_FORM_HEADERS } from './config.js';

/**
 * Perform login and return the access token.
 *
 * The token is a signed JWT whose `org` claim is the user's default active organization.
 * Organization-scoped routes resolve the tenant from this claim — there is no `{organization_id}`
 * path segment and no organization id header for the flat routes. To act in a different
 * organization, re-mint the token with `switchToOrganization` / `switchToPersonal`.
 */
export function login(email, password) {
  const response = http.post(`${API_PREFIX}/auth/login`, JSON.stringify({ email, password }), {
    headers: PUBLIC_AUTH_FORM_HEADERS,
  });

  if (response.status === 200) {
    const body = JSON.parse(response.body);
    const token = body.data?.access_token || body.data?.token;
    if (typeof token === 'string' && token.length > 0) return token;
    throw new Error('Load login returned no access token');
  }
  throw new Error(`Load login failed with HTTP ${response.status}`);
}

/**
 * Re-mint the access token scoped to a specific team organization the user belongs to
 * (`POST /auth/switch-to-organization`). Use the returned token for subsequent organization-scoped calls —
 * the active organization rides its `org` claim. Returns the new token, or null on failure.
 */
export function switchToOrganization(token, organizationPublicId) {
  const response = http.post(
    `${API_PREFIX}/auth/switch-to-organization`,
    JSON.stringify({ organization_id: organizationPublicId }),
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
  );
  if (response.status === 200) {
    const body = JSON.parse(response.body);
    if (typeof body.data?.access_token !== 'string' || !body.data.access_token) {
      throw new Error('Load organization switch returned no access token');
    }
    return body.data.access_token;
  }
  throw new Error(`Load organization switch failed with HTTP ${response.status}`);
}

/**
 * Re-mint the access token scoped to the caller's personal organization
 * (`POST /auth/switch-to-personal`). Returns the new token, or null on failure.
 */
export function switchToPersonal(token) {
  const response = http.post(`${API_PREFIX}/auth/switch-to-personal`, null, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (response.status === 200) {
    const body = JSON.parse(response.body);
    if (typeof body.data?.access_token !== 'string' || !body.data.access_token) {
      throw new Error('Load organization switch returned no access token');
    }
    return body.data.access_token;
  }
  throw new Error(`Load organization switch failed with HTTP ${response.status}`);
}

/**
 * Convenience: log in, then switch the active organization so the returned token is scoped to
 * `organizationPublicId`. Returns the plain login token only when no organization is requested.
 * Login or requested scope failure aborts setup instead of targeting another tenant.
 */
export function loginScopedToOrganization(email, password, organizationPublicId) {
  const token = login(email, password);
  if (!(token && organizationPublicId)) return token;
  return switchToOrganization(token, organizationPublicId);
}

/**
 * Build authorization headers for authenticated requests.
 *
 * The active organization comes from the token's `org` claim — do NOT add an organization id
 * header for organization-scoped routes (it is ignored by the flat routes; only the upload domain reads it).
 */
export function authHeaders(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}
