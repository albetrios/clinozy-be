import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { API_PREFIX, PUBLIC_AUTH_FORM_HEADERS } from '../helpers/config.js';
import { assertCondition, requireData } from '../helpers/checks.js';
import { credentialPool } from '../helpers/pool.js';
import { mailToken, requireMailbox } from '../helpers/mailbox.js';
import { idempotencyKey } from '../helpers/idempotency.js';

/** Creates disposable teams and invitees; proves invitation, membership, ownership and deletion transitions. */
const VUS = Number(__ENV.VUS || '4');
const ITERATIONS = Number(__ENV.ITERATIONS || '1');
const completed = new Counter('tenant_lifecycle_journeys_completed');
export const options = {
  scenarios: {
    tenancy: { executor: 'per-vu-iterations', vus: VUS, iterations: ITERATIONS, maxDuration: '5m' },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    dropped_iterations: ['count==0'],
    tenant_lifecycle_journeys_completed: [`count==${VUS * ITERATIONS}`],
    'http_req_duration{phase:read}': ['p(95)<500', 'p(99)<1000'],
    'http_req_duration{phase:write}': ['p(95)<800', 'p(99)<1200'],
  },
};
export function setup() {
  requireMailbox();
  if (credentialPool.length < VUS * ITERATIONS)
    throw new Error('Distinct owner required for every journey');
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
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Idempotency-Key': idempotencyKey('tenant-lifecycle'),
      },
      tags: {
        name: `${method} ${path.replace(/\/(?:org|mem|inv|rol)_[a-z0-9]+/g, '/:id')}`,
        phase: method === 'GET' ? 'read' : 'write',
        route: path.split('?')[0],
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
function scope(token, organizationId) {
  return requireData(
    request('POST', '/auth/switch-to-organization', token, { organization_id: organizationId }),
    'scope team',
  ).access_token;
}
function inviteAndAccept({ token, email, role, inviteeToken, inviteeProfile }) {
  let membership = requireData(
    request('POST', '/tenancy/organization/memberships', token, { email, role_id: role.id }),
    'invite member',
  );
  assertCondition(
    membership.status === 'INVITED' && Boolean(membership.invitation?.id),
    'pending membership has invitation',
  );
  const invitationId = membership.invitation.id;
  const firstToken = mailToken({ email, invitationId });
  request('POST', `/tenancy/invitations/${invitationId}/accept`, token, { token: firstToken }, 403);
  requireData(
    request('POST', `/tenancy/organization/invitations/${invitationId}/resend`, token, {
      expires_in_days: 10,
    }),
    'resend invitation',
  );
  const replacement = mailToken({ email, invitationId });
  assertCondition(replacement !== firstToken, 'resend rotates invitation token');
  request(
    'POST',
    `/tenancy/invitations/${invitationId}/accept`,
    inviteeToken,
    { token: firstToken },
    400,
  );
  requireData(
    request('POST', `/tenancy/invitations/${invitationId}/accept`, inviteeToken, {
      token: replacement,
    }),
    'accept valid invitation',
  );
  request(
    'POST',
    `/tenancy/invitations/${invitationId}/accept`,
    inviteeToken,
    { token: replacement },
    404,
  );
  membership = requireData(
    request('GET', `/tenancy/organization/memberships/${membership.id}`, token),
    'accepted member readback',
  );
  assertCondition(
    membership.status === 'ACTIVE' &&
      membership.user_id === inviteeProfile.id &&
      membership.invitation === null,
    'accept atomically activates correct member',
  );
  return membership;
}

function verifyMembershipTransitions({
  token,
  inviteeToken,
  organization,
  membership,
  owner,
  inviteeProfile,
}) {
  let memberToken = scope(inviteeToken, organization.id);

  requireData(
    request('GET', '/tenancy/organization', memberToken),
    'accepted member can access team',
  );
  requireData(
    request('PATCH', `/tenancy/organization/memberships/${membership.id}`, token, {
      status: 'SUSPENDED',
    }),
    'suspend member',
  );
  request('GET', '/tenancy/organization', memberToken, null, 404);
  requireData(
    request('PATCH', `/tenancy/organization/memberships/${membership.id}`, token, {
      status: 'ACTIVE',
    }),
    'restore member',
  );
  memberToken = scope(memberToken, organization.id);

  const transferred = requireData(
    request('POST', '/tenancy/organization/transfer-ownership', token, {
      new_owner_user_id: inviteeProfile.id,
    }),
    'transfer ownership',
  );
  assertCondition(transferred.user_id === inviteeProfile.id, 'target becomes owner');
  // A fresh token is needed after ownership changes; verify the new owner can transfer back.
  memberToken = scope(memberToken, organization.id);

  requireData(
    request('POST', '/tenancy/organization/transfer-ownership', memberToken, {
      new_owner_user_id: owner.userPublicId,
    }),
    'transfer ownership back',
  );

  request('POST', '/tenancy/organization/leave', memberToken, null, 200);
  request('GET', '/tenancy/organization', memberToken, null, 404);
  inviteeToken = requireData(
    request('POST', '/auth/switch-to-personal', memberToken),
    'invitee returns to personal',
  ).access_token;
  return inviteeToken;
}

export default function (owners) {
  const owner = owners[(__VU - 1) * ITERATIONS + __ITER];
  sleep((__VU - 1) * 0.1);
  let token = requireData(
    request('POST', '/auth/login', null, { email: owner.email, password: owner.password }),
    'owner login',
  ).access_token;
  const unique = `${__VU}-${__ITER}-${Date.now()}`;
  const slug = `load-team-${unique}`;
  const organization = requireData(
    request('POST', '/tenancy/organizations', token, { name: `Load team ${unique}`, slug }),
    'create team',
  );
  token = scope(token, organization.id);
  const fixture = requireData(
    http.post(`${__ENV.LOAD_MAILBOX_URL}/team-plan?organization_id=${organization.id}`, null, {
      headers: { Authorization: `Bearer ${__ENV.LOAD_MAILBOX_TOKEN}` },
      tags: {
        name: 'fixture-local-subscription',
        fixture: 'subscription',
      },
    }),
    'local subscription fixture',
  );
  assertCondition(
    fixture.localSubscriptionFixture === true,
    'team has a real local seat allowance',
  );

  let inviteeToken;
  let organizationDeleted = false;
  try {
    const found = requireData(
      request('GET', `/tenancy/organizations/by-slug/${slug}`, token),
      'lookup created slug',
    );
    assertCondition(found.id === organization.id, 'slug lookup resolves owned team');
    const roles = requireData(
      request('GET', '/tenancy/organization/roles', token),
      'roles for new team',
    );
    const role = roles.find((row) => row.name.toLowerCase() !== 'owner');
    assertCondition(Boolean(role), 'non-owner invitation role exists');
    const email = `load-invite-${unique}@loadtest.example.com`;
    const sent = requireData(
      request('POST', '/auth/email/send-code', null, { email }),
      'verify invitee email',
    );
    const invitee = requireData(
      request('POST', '/auth/email/login', null, { email, code: sent.debug_verification_code }),
      'invitee login',
    );
    inviteeToken = invitee.access_token;
    const inviteeProfile = requireData(
      request('GET', '/users/me', inviteeToken),
      'verified invitee',
    );
    assertCondition(inviteeProfile.is_email_verified === true, 'invitee proves email control');
    const membership = inviteAndAccept({ token, email, role, inviteeToken, inviteeProfile });
    inviteeToken = verifyMembershipTransitions({
      token,
      inviteeToken,
      organization,
      membership,
      owner,
      inviteeProfile,
    });
    token = scope(token, organization.id);
    const pending = requireData(
      request('POST', '/tenancy/organization/memberships', token, { email, role_id: role.id }),
      're-invite after leave',
    );
    request(
      'DELETE',
      `/tenancy/organization/invitations/${pending.invitation.id}`,
      token,
      null,
      204,
    );
    request('GET', `/tenancy/organization/memberships/${pending.id}`, token, null, 404);
    const removable = requireData(
      request('POST', '/tenancy/organization/memberships', token, { email, role_id: role.id }),
      'third pending member',
    );
    request('DELETE', `/tenancy/organization/memberships/${removable.id}`, token, null, 204);
    request('GET', `/tenancy/organization/memberships/${removable.id}`, token, null, 404);
    request('DELETE', '/tenancy/organization', token, null, 204);
    organizationDeleted = true;
    const personal = requireData(
      request('POST', '/auth/switch-to-personal', token),
      'switch to personal',
    ).access_token;
    const organizations = requireData(
      request('GET', '/users/me/organizations', personal),
      'organization deletion readback',
    );
    assertCondition(
      !organizations.some((row) => row.id === organization.id),
      'deleted team absent from membership list',
    );
    request('DELETE', '/users/me', inviteeToken, null, 204);
    inviteeToken = null;
    completed.add(1);
  } finally {
    if (!organizationDeleted) request('DELETE', '/tenancy/organization', token, null, 204);
    if (inviteeToken) request('DELETE', '/users/me', inviteeToken, null, 204);
  }
}
