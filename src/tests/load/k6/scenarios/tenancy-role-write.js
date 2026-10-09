import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { API_PREFIX, THRESHOLDS, SCENARIOS } from '../helpers/config.js';
import { authHeaders } from '../helpers/auth.js';
import { idempotencyKey } from '../helpers/idempotency.js';
import { requireData } from '../helpers/checks.js';

/**
 * Owned role lifecycle: concurrent duplicate creation, replay identity, persisted
 * update, exact permission replacement, deletion and absence. Uses a scoped
 * ordinary TEAM owner; concurrent clients share this identity (not distinct users).
 * Every iteration must finish, including cleanup; failed setup cannot pass silently.
 */
const completed = new Counter('role_journeys_completed');
export const options = {
  scenarios: {
    load: {
      ...SCENARIOS.pacedWrites,
      duration: __ENV.DURATION || '2m',
      exec: 'tenancyRoleWriteOps',
    },
  },
  thresholds: {
    ...THRESHOLDS,
    checks: ['rate==1'],
    role_journeys_completed: [`count>=${Number(__ENV.MIN_COMPLETED || '1')}`],
    dropped_iterations: ['count==0'],
  },
};

export function setup() {
  if (!(__ENV.TEST_TOKEN && __ENV.TEST_ORG_ID)) {
    throw new Error('TEST_TOKEN and TEST_ORG_ID are required; no writes executed');
  }
}

function requireCheck(condition, label) {
  if (!check(condition, { [label]: (value) => value })) throw new Error(label);
}

export function tenancyRoleWriteOps() {
  const headers = authHeaders(__ENV.TEST_TOKEN).headers;
  const base = `${API_PREFIX}/tenancy/organization/roles`;
  const name = `k6-owned-role-${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({ name, description: 'k6 load test role' });
  const createOptions = {
    headers: { ...headers, 'X-Idempotency-Key': idempotencyKey('role') },
    tags: { name: 'create-role' },
    responseCallback: http.expectedStatuses(200, 409),
  };
  let roleId;
  let deleted = false;
  try {
    const responses = http.batch([
      ['POST', base, body, createOptions],
      ['POST', base, body, createOptions],
    ]);
    for (const response of responses) {
      requireCheck(
        response.status === 200 || response.status === 409,
        'duplicate create: only success or in-flight conflict',
      );
    }
    const successes = responses.filter((response) => response.status === 200);
    requireCheck(successes.length > 0, 'duplicate create: at least one persisted success');
    roleId = requireData(successes[0], 'create-role').id;
    requireCheck(typeof roleId === 'string' && roleId.length > 0, 'create-role: resource id');
    for (const response of successes)
      requireCheck(response.json('data.id') === roleId, 'duplicate create: same resource');
    const replay = http.post(base, body, { ...createOptions, tags: { name: 'replay-role' } });
    requireCheck(
      requireData(replay, 'replay-role').id === roleId,
      'replay: same persisted resource',
    );

    const roles = requireData(
      http.get(base, { headers, tags: { name: 'list-roles' } }),
      'list-roles',
    );
    requireCheck(
      Array.isArray(roles) && roles.filter((role) => role.name === name).length === 1,
      'duplicate create: exactly one listed effect',
    );
    const path = `${base}/${roleId}`;
    const description = 'k6 persisted update';
    requireData(
      http.patch(path, JSON.stringify({ description }), { headers, tags: { name: 'patch-role' } }),
      'patch-role',
    );
    const readback = requireData(
      http.get(path, { headers, tags: { name: 'get-role' } }),
      'get-role',
    );
    requireCheck(
      readback.id === roleId && readback.description === description,
      'update persisted on independent read',
    );
    const codes = ['membership:read', 'organization:read'];
    requireData(
      http.put(`${path}/permissions`, JSON.stringify({ permission_codes: codes }), {
        headers,
        tags: { name: 'put-role-permissions' },
      }),
      'put-role-permissions',
    );
    const permissions = requireData(
      http.get(`${path}/permissions`, { headers, tags: { name: 'get-role-permissions' } }),
      'get-role-permissions',
    );
    requireCheck(
      Array.isArray(permissions) &&
        JSON.stringify(permissions.map((item) => item.permission_code).sort()) ===
          JSON.stringify(codes),
      'exact permission replacement persisted',
    );
    requireCheck(
      http.del(path, null, { headers, tags: { name: 'delete-role' } }).status === 204,
      'delete-role: exact 204',
    );
    deleted = true;
    const absent = http.get(path, {
      headers,
      tags: { name: 'deleted-role' },
      responseCallback: http.expectedStatuses(404),
    });
    requireCheck(absent.status === 404, 'deleted role is absent');
    completed.add(1);
  } finally {
    if (roleId && !deleted) {
      requireCheck(
        http.del(`${base}/${roleId}`, null, { headers, tags: { name: 'cleanup-role' } }).status ===
          204,
        'failed journey cleanup',
      );
    }
  }
  sleep(1);
}

export default tenancyRoleWriteOps;
