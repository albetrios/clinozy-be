import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { API_PREFIX, THRESHOLDS } from '../helpers/config.js';
import { authHeaders } from '../helpers/auth.js';
import { credentialPool, mintTokenPool, vuToken } from '../helpers/pool.js';

/** Distinct users across tenants: identity binding, cursor pages, and foreign-member denial. */
const users = Number(__ENV.VUS || '20');
const duration = __ENV.DURATION;
const completed = new Counter('tenant_read_journeys_completed');
const distinctCompleted = new Counter('tenant_read_distinct_users_completed');
const coldRequestDuration = new Trend('tenant_cold_request_duration', true);
const warmRequestDuration = new Trend('tenant_warm_request_duration', true);
let journeyPhase;
export const options = {
  scenarios: {
    readers: duration
      ? { executor: 'constant-vus', vus: users, duration, gracefulStop: '30s' }
      : { executor: 'per-vu-iterations', vus: users, iterations: 2, maxDuration: '2m' },
  },
  thresholds: {
    ...THRESHOLDS,
    'http_req_duration{expected_response:true}': ['p(95)<500', 'p(99)<1000'],
    tenant_cold_request_duration: ['p(95)<500', 'p(99)<1000'],
    tenant_warm_request_duration: ['p(95)<500', 'p(99)<1000'],
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    tenant_read_distinct_users_completed: [`count==${users}`],
    dropped_iterations: ['count==0'],
    tenant_read_journeys_completed: [duration ? `count>=${users}` : `count==${users * 2}`],
  },
  setupTimeout: '3m',
};
function requireCheck(condition, label) {
  if (!check(condition, { [label]: (value) => value })) throw new Error(label);
}
function read(path, token, name) {
  const response = http.get(`${API_PREFIX}${path}`, { ...authHeaders(token), tags: { name } });
  observeJourneyRequest(response);
  requireCheck(response.status === 200, `${name}: exact 200`);
  return response;
}

function observeJourneyRequest(response) {
  // Setup reads have no journey phase; never mix them into first-journey latency.
  if (journeyPhase === 'cold') coldRequestDuration.add(response.timings.duration);
  if (journeyPhase === 'warm') warmRequestDuration.add(response.timings.duration);
}
export function setup() {
  if (credentialPool.length < users) throw new Error('Insufficient distinct users');
  // Round-robin tenants so a smaller run still exercises each available tenant.
  const groups = new Map();
  for (const credential of credentialPool) {
    if (!groups.has(credential.organizationPublicId))
      groups.set(credential.organizationPublicId, []);
    groups.get(credential.organizationPublicId).push(credential);
  }
  const ordered = [];
  while (ordered.length < users) {
    for (const group of groups.values())
      if (group.length && ordered.length < users) ordered.push(group.shift());
  }
  requireCheck(
    new Set(ordered.map((actor) => actor.userPublicId)).size === users,
    'fixture: every configured actor is a distinct user',
  );
  const pool = mintTokenPool(ordered);
  const examples = [];
  for (const actor of pool) {
    if (examples.some((entry) => entry.organization === actor.organizationPublicId)) continue;
    const response = read(
      '/tenancy/organization/memberships?limit=2',
      actor.token,
      'setup-memberships',
    );
    const first = response.json('data')[0];
    requireCheck(Boolean(first?.id), 'fixture: nonempty memberships');
    examples.push({ organization: actor.organizationPublicId, member: first.id });
  }
  requireCheck(examples.length >= 2, 'fixture: multiple tenants');
  return { pool, examples };
}
export default function (fixtures) {
  journeyPhase = __ITER === 0 ? 'cold' : 'warm';
  try {
    const actor = vuToken(fixtures.pool);
    const profile = read('/users/me', actor.token, 'distinct-profile').json('data');
    requireCheck(profile.id === actor.userPublicId, 'profile bound to actual user');
    const context = read('/auth/me/context', actor.token, 'distinct-context').json('data');
    requireCheck(
      context.user.id === actor.userPublicId &&
        context.active_organization.id === actor.organizationPublicId,
      'auth context bound to actual tenant and user',
    );
    const first = read(
      '/tenancy/organization/memberships?limit=2',
      actor.token,
      'members-page-one',
    );
    const rows = first.json('data');
    const cursor = first.json('meta.pagination.next');
    requireCheck(
      Array.isArray(rows) && rows.length === 2 && typeof cursor === 'string',
      'first page populated with next cursor',
    );
    const second = read(
      `/tenancy/organization/memberships?limit=2&after=${encodeURIComponent(cursor)}`,
      actor.token,
      'members-page-two',
    ).json('data');
    requireCheck(Array.isArray(second) && second.length === 2, 'second page populated');
    requireCheck(
      [...rows, ...second].every((row) => row.organization_id === actor.organizationPublicId),
      'all page rows belong to authenticated tenant',
    );
    if (second.some((row) => rows.some((previous) => previous.id === row.id))) {
      console.error(
        JSON.stringify({
          issue: 'cursor-page-overlap',
          tenant: actor.organizationPublicId,
          first: rows.map((row) => ({ id: row.id, created_at: row.created_at })),
          second: second.map((row) => ({ id: row.id, created_at: row.created_at })),
        }),
      );
    }
    requireCheck(
      second.every((row) => !rows.some((previous) => previous.id === row.id)),
      'cursor pages do not repeat rows',
    );
    const ownMember = read(
      `/tenancy/organization/memberships/${rows[0].id}`,
      actor.token,
      'member-detail',
    ).json('data');
    requireCheck(
      ownMember.id === rows[0].id && ownMember.organization_id === actor.organizationPublicId,
      'member detail belongs to authenticated tenant',
    );
    const permissions = read(
      `/tenancy/organization/memberships/${rows[0].id}/permissions`,
      actor.token,
      'member-permissions',
    ).json('data');
    // The effective codes of every role the member holds, main and extra (launch D5).
    requireCheck(
      Array.isArray(permissions.permission_codes) &&
        permissions.permission_codes.includes('membership:read'),
      'member permissions reflect seeded role',
    );
    const foreign = fixtures.examples.find(
      (entry) => entry.organization !== actor.organizationPublicId,
    );
    const denied = http.get(`${API_PREFIX}/tenancy/organization/memberships/${foreign.member}`, {
      ...authHeaders(actor.token),
      tags: { name: 'foreign-member-denied' },
      responseCallback: http.expectedStatuses(404),
    });
    observeJourneyRequest(denied);
    requireCheck(denied.status === 404, 'foreign membership denied without exposing resource');
    completed.add(1);
    if (__ITER === 0) distinctCompleted.add(1);
  } finally {
    // Preserve the failure gate while preventing failed journeys from hot-looping.
    if (duration) sleep(0.1);
  }
}
