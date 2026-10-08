import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { API_PREFIX } from '../helpers/config.js';
import { authHeaders } from '../helpers/auth.js';

/**
 * Read-surface functional load: one authenticated account, one TEAM tenant,
 * shared by all VUs. VUs are concurrent clients, not distinct people/tenants.
 * All 23 routes must return 200 and their basic public data shape. This excludes
 * destructive writes, external-provider callbacks, live Stripe/S3 operations,
 * admin-only routes and dynamic resource detail routes needing other fixtures.
 * No 403 or rate-limit rejection is counted as successful route execution.
 */
const VUS = Number(__ENV.VUS || '10');
const ITERATIONS = Number(__ENV.ITERATIONS || '20');
const READ_ROUTES = [
  {
    name: 'users-me',
    path: '/users/me',
    shape: 'user',
    permission: null,
  },
  {
    name: 'user-settings',
    path: '/users/me/settings',
    shape: 'object',
    permission: null,
  },
  {
    name: 'notification-preferences',
    path: '/users/me/notification-preferences',
    shape: 'array',
    permission: null,
  },
  {
    name: 'my-organizations',
    path: '/users/me/organizations',
    shape: 'array',
    permission: null,
  },
  {
    name: 'auth-context',
    path: '/auth/me/context',
    shape: 'context',
    permission: null,
  },
  {
    name: 'auth-sessions',
    path: '/auth/me/sessions',
    shape: 'array',
    permission: null,
  },
  {
    name: 'auth-mfa',
    path: '/auth/me/mfa',
    shape: 'array',
    permission: null,
  },
  {
    name: 'auth-methods',
    path: '/auth/me/auth-methods',
    shape: 'array',
    permission: null,
  },
  {
    name: 'webauthn-credentials',
    path: '/auth/me/webauthn/credentials',
    shape: 'array',
    permission: null,
  },
  {
    name: 'oauth-providers',
    path: '/auth/oauth/providers',
    shape: 'providers',
    permission: null,
  },
  {
    name: 'billing-plans',
    path: '/billing/plans',
    shape: 'array',
    permission: null,
  },
  {
    name: 'billing-subscriptions',
    path: '/billing/subscriptions',
    shape: 'array',
    permission: 'subscription:read',
  },
  {
    name: 'notifications',
    path: '/notify/notifications',
    shape: 'array',
    permission: null,
  },
  {
    name: 'unread-count',
    path: '/notify/notifications/unread-count',
    shape: 'count',
    permission: null,
  },
  {
    name: 'webhooks',
    path: '/notify/webhooks',
    shape: 'array',
    permission: 'webhook:read',
  },
  {
    name: 'webhook-events',
    path: '/notify/webhook-events',
    shape: 'array',
    permission: 'webhook:read',
  },
  {
    name: 'organization',
    path: '/tenancy/organization',
    shape: 'organization',
    permission: null,
  },
  {
    name: 'organization-settings',
    path: '/tenancy/organization/settings',
    shape: 'object',
    permission: 'organization:read',
  },
  {
    name: 'memberships',
    path: '/tenancy/organization/memberships',
    shape: 'array',
    permission: 'membership:read',
  },
  {
    name: 'roles',
    path: '/tenancy/organization/roles',
    shape: 'array',
    permission: 'role:read',
  },
  {
    name: 'api-keys',
    path: '/tenancy/organization/api-keys',
    shape: 'array',
    permission: 'api-key:read',
  },
  {
    name: 'notification-policies',
    path: '/tenancy/organization/notification-policies',
    shape: 'array',
    permission: 'notification-policy:read',
  },
  {
    name: 'permissions',
    path: '/tenancy/permissions',
    shape: 'array',
    permission: null,
  },
];
const completedReadJourneys = new Counter('completed_read_journeys');
const perRouteThresholds = {};
for (const route of READ_ROUTES) {
  perRouteThresholds[`http_reqs{name:read-${route.name}}`] = [`count>=${ITERATIONS}`];
  perRouteThresholds[`http_req_duration{name:read-${route.name}}`] = ['p(95)<800', 'p(99)<1500'];
}
export const options = {
  scenarios: {
    read_surface: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
    completed_read_journeys: [`count==${ITERATIONS}`],
    ...perRouteThresholds,
  },
};

function parseEnvelope(response) {
  try {
    return JSON.parse(response.body);
  } catch {
    return null;
  }
}
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validData(route, data, actor) {
  switch (route.shape) {
    case 'array':
      return Array.isArray(data);
    case 'object':
      return isRecord(data);
    case 'user':
      return isRecord(data) && data.id === actor.userId;
    case 'organization':
      return isRecord(data) && data.id === actor.organizationId;
    case 'context':
      return (
        isRecord(data) &&
        data.user?.id === actor.userId &&
        data.active_organization?.id === actor.organizationId &&
        Array.isArray(data.my_permissions)
      );
    case 'providers':
      return (
        isRecord(data) &&
        Array.isArray(data.providers) &&
        data.providers.every((provider) => typeof provider === 'string')
      );
    case 'count':
      return isRecord(data) && Number.isInteger(data.count) && data.count >= 0;
    default:
      return false;
  }
}
export function setup() {
  if (!(__ENV.TEST_TOKEN && __ENV.TEST_ORG_ID)) {
    throw new Error('Read-surface load requires TEST_TOKEN scoped to TEST_ORG_ID');
  }
  if (![VUS, ITERATIONS].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error('VUS and ITERATIONS must be positive integers');
  }
  const response = http.get(`${API_PREFIX}/auth/me/context`, {
    ...authHeaders(__ENV.TEST_TOKEN),
    tags: { name: 'read-surface-prerequisites' },
  });
  const data = parseEnvelope(response)?.data;
  if (
    response.status !== 200 ||
    !data?.user?.id ||
    data.active_organization?.id !== __ENV.TEST_ORG_ID ||
    data.active_organization?.type !== 'TEAM' ||
    !Array.isArray(data.my_permissions)
  ) {
    throw new Error('Load actor must have a valid session scoped to the requested TEAM tenant');
  }
  const required = [...new Set(READ_ROUTES.map((route) => route.permission).filter(Boolean))];
  const missing = required.filter((permission) => !data.my_permissions.includes(permission));
  if (missing.length) {
    throw new Error(`Read-surface actor lacks required permissions: ${missing.join(', ')}`);
  }
  return { userId: data.user.id, organizationId: data.active_organization.id };
}
export default function readSurface(actor) {
  let complete = true;
  for (const route of READ_ROUTES) {
    const response = http.get(`${API_PREFIX}${route.path}`, {
      ...authHeaders(__ENV.TEST_TOKEN),
      tags: { name: `read-${route.name}` },
    });
    const envelope = parseEnvelope(response);
    const passed = check(response, {
      [`${route.name} HTTP 200`]: (res) => res.status === 200,
      [`${route.name} success envelope`]: () =>
        envelope !== null &&
        !envelope.error &&
        typeof envelope.meta?.request_id === 'string' &&
        envelope.meta.request_id.length > 0,
      [`${route.name} public data shape`]: () => validData(route, envelope?.data, actor),
    });
    complete = passed && complete;
    sleep(0.05 + Math.random() * 0.1);
  }
  if (complete) completedReadJourneys.add(1);
  sleep(0.5 + Math.random());
}
