import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { API_PREFIX, THRESHOLDS } from '../helpers/config.js';
import { assertCondition, requireData, requireScopedCredentials } from '../helpers/checks.js';
import { authHeaders } from '../helpers/auth.js';

/** Settings toggles are serialized per owner; readback and restoration are mandatory. */
const iterations = Number(__ENV.ITERATIONS || '20');
const completed = new Counter('settings_journeys_completed');
export const options = {
  scenarios: { settings: { executor: 'shared-iterations', vus: 1, iterations, maxDuration: '2m' } },
  thresholds: {
    ...THRESHOLDS,
    checks: ['rate==1'],
    settings_journeys_completed: [`count==${iterations}`],
  },
};
export function setup() {
  requireScopedCredentials();
}
export default function organizationSettingsWriteOps() {
  const { headers } = authHeaders(__ENV.TEST_TOKEN);
  const resources = [
    [
      'PATCH',
      '/tenancy/organization/settings',
      'is_email_notifications_enabled',
      'organization-settings',
    ],
    ['PATCH', '/users/me/settings', 'is_dark_mode_enabled', 'user-settings'],
    ['PATCH', '/users/me', 'job_title', 'user-profile'],
    ['PATCH', '/tenancy/organization', 'name', 'organization-profile'],
  ].map(([method, path, field, name]) => ({ method, path, field, name }));
  for (const resource of resources) {
    const before = requireData(
      http.get(`${API_PREFIX}${resource.path}`, {
        headers,
        tags: { name: `get-${resource.name}` },
      }),
      resource.name,
    );
    const oldValue = before[resource.field];
    assertCondition(
      typeof oldValue === 'boolean' || typeof oldValue === 'string' || oldValue === null,
      `${resource.name}: restorable fixture`,
    );
    const changedValue = typeof oldValue === 'boolean' ? !oldValue : `k6 fixture update ${__ITER}`;
    try {
      requireData(
        http.request(
          resource.method,
          `${API_PREFIX}${resource.path}`,
          JSON.stringify({ [resource.field]: changedValue }),
          { headers, tags: { name: `patch-${resource.name}` } },
        ),
        resource.name,
      );
      const changed = requireData(
        http.get(`${API_PREFIX}${resource.path}`, {
          headers,
          tags: { name: `readback-${resource.name}` },
        }),
        resource.name,
      );
      assertCondition(
        changed[resource.field] === changedValue,
        `${resource.name}: toggle persisted`,
      );
    } finally {
      requireData(
        http.request(
          resource.method,
          `${API_PREFIX}${resource.path}`,
          JSON.stringify({ [resource.field]: oldValue }),
          { headers, tags: { name: `restore-${resource.name}` } },
        ),
        resource.name,
      );
      const restored = requireData(
        http.get(`${API_PREFIX}${resource.path}`, {
          headers,
          tags: { name: `restored-${resource.name}` },
        }),
        resource.name,
      );
      assertCondition(
        restored[resource.field] === oldValue,
        `${resource.name}: original value restored`,
      );
    }
  }
  const preferences = requireData(
    http.get(`${API_PREFIX}/users/me/notification-preferences`, {
      headers,
      tags: { name: 'get-preferences' },
    }),
    'get-preferences',
  );
  assertCondition(Array.isArray(preferences), 'preference fixture is an array');
  const updatedPreferences = preferences.length
    ? preferences.map((preference, index) =>
        index === 0 ? { ...preference, is_enabled: !preference.is_enabled } : preference,
      )
    : [{ notification_type: 'system.welcome', channel: 'IN_APP', is_enabled: false }];
  // Compare semantic tuples, independent of JSON object property order.
  const normalized = (items) =>
    JSON.stringify(
      items
        .map((item) => [item.notification_type, item.channel, item.is_enabled])
        .sort((left, right) => `${left[0]}:${left[1]}`.localeCompare(`${right[0]}:${right[1]}`)),
    );
  try {
    requireData(
      http.put(
        `${API_PREFIX}/users/me/notification-preferences`,
        JSON.stringify({ preferences: updatedPreferences }),
        { headers, tags: { name: 'put-preferences' } },
      ),
      'put-preferences',
    );
    const readback = requireData(
      http.get(`${API_PREFIX}/users/me/notification-preferences`, {
        headers,
        tags: { name: 'readback-preferences' },
      }),
      'readback-preferences',
    );
    assertCondition(
      normalized(readback) === normalized(updatedPreferences),
      'complete preference replacement persisted',
    );
  } finally {
    requireData(
      http.put(`${API_PREFIX}/users/me/notification-preferences`, JSON.stringify({ preferences }), {
        headers,
        tags: { name: 'restore-preferences' },
      }),
      'restore-preferences',
    );
    const restored = requireData(
      http.get(`${API_PREFIX}/users/me/notification-preferences`, {
        headers,
        tags: { name: 'restored-preferences' },
      }),
      'restored-preferences',
    );
    assertCondition(
      normalized(restored) === normalized(preferences),
      'original preference set restored',
    );
  }
  completed.add(1);
}
