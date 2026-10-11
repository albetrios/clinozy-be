import { seedRecentStepUpForTestUser } from '@/tests/helpers/test-step-up.helper.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { AUDIT_PERMISSIONS } from '@/domains/audit/audit.permissions.js';
import { audit_outbox } from '@/domains/audit/audit-outbox.schema.js';
import { runAuditOutboxDrainJob } from '@/domains/audit/workers/audit-outbox-drain.processor.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedAllPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { MemberInvitationRepository } from '@/domains/tenancy/sub-domains/membership/member-invitation/member-invitation.repository.js';
import { hashInvitationToken } from '@/domains/tenancy/sub-domains/membership/member-invitation/member-invitation.token.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import {
  MAINTENANCE_SCOPE,
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import {
  generateTestToken,
  generateTestTokenWithActiveSession,
} from '@/tests/helpers/test-auth.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';

type OrganizationContext = Awaited<ReturnType<typeof createOrganizationContext>>;

let application: FastifyInstance;

/** A team organization whose owner holds every tenancy permission (and audit-log read). */
async function createOrganizationContext() {
  const owner = await createTestUser({ isEmailVerified: true });
  const organization = await createTestOrganization({ ownerUserId: owner.id });
  const adminRole = await createRoleWithPermissions({
    organizationId: organization.id,
    permissionCodes: [...Object.values(TENANCY_PERMISSIONS), AUDIT_PERMISSIONS.AUDIT_LOG_READ],
  });
  await createMembership({
    userId: owner.id,
    organizationId: organization.id,
    roleId: adminRole.id,
  });
  const memberRole = await createRoleWithPermissions({
    organizationId: organization.id,
    permissionCodes: [TENANCY_PERMISSIONS.MEMBERSHIP_READ],
  });
  const { token, sessionPublicId } = await generateTestTokenWithActiveSession(
    application,
    owner.public_id,
    { organizationPublicId: organization.public_id },
  );
  // Organization deletion and ownership transfer need a recent step-up on this session.
  await seedRecentStepUpForTestUser(owner.public_id, sessionPublicId);
  return { owner, organization, memberRole, token };
}

/** Adds an ACTIVE member holding the context's member role. */
async function addActiveMember(context: OrganizationContext) {
  const member = await createTestUser({ isEmailVerified: true });
  const membership = await createMembership({
    userId: member.id,
    organizationId: context.organization.id,
    roleId: context.memberRole.id,
  });
  return { member, membership };
}

async function send(options: {
  token: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'GET';
  path: string;
  payload?: Record<string, unknown>;
}) {
  return injectAuthenticated(application, {
    method: options.method,
    url: testApiPath(options.path),
    token: options.token,
    // Several of these writes require the header (membership add, organization create,
    // ownership transfer); a fresh key on every write keeps each request independent.
    ...(options.method === 'GET'
      ? {}
      : { headers: { 'x-idempotency-key': `audit-trail-${randomUUID()}` } }),
    ...(options.payload ? { payload: options.payload } : {}),
  });
}

async function stagedRows(action: string) {
  return getOperatorDatabase().select().from(audit_outbox).where(eq(audit_outbox.action, action));
}

/** Runs the real drain and asserts every staged row reached `audit.logs` (ids resolved, none failed). */
async function expectEveryStagedRowToDrain() {
  const result = await withMaintenanceDatabaseContext({
    scope: MAINTENANCE_SCOPE.AUDIT_OUTBOX_DRAIN,
    callback: (databaseHandle) => runAuditOutboxDrainJob(databaseHandle),
  });
  expect(result.transientFailed + result.permanentlyFailed).toBe(0);
  const outbox = await getOperatorDatabase().select().from(audit_outbox);
  expect(outbox.filter((row) => row.status !== 'PROCESSED')).toEqual([]);
}

/**
 * Governance changes to an organization must reach its audit log — the one its admins read through
 * `GET /tenancy/organization/audit-logs`. Membership, invitation, ownership, settings,
 * role-permission and notification-policy changes recorded nothing, although
 * `docs/reference/security/audit-logs.md` listed most of them; API-key events carried no
 * organization, so that log never showed them; role creation lost the role id. Each case drives
 * the real route, reads the staged outbox row, then runs the real drain.
 */
describe('tenancy audit trail — organization governance changes reach the audit log', () => {
  beforeAll(async () => {
    const { app } = await createTestApp();
    application = app;
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedAllPermissions();
  });

  it('records profile and settings changes; a status or security-policy change at WARNING', async () => {
    const context = await createOrganizationContext();
    const { token } = context;
    const patch = (path: string, payload: Record<string, unknown>) =>
      send({ token, method: 'PATCH', path, payload });

    expect((await patch('/tenancy/organization', { name: 'Renamed Clinic' })).statusCode).toBe(200);
    expect((await patch('/tenancy/organization', { status: 'ACTIVE' })).statusCode).toBe(200);
    expect(
      (await patch('/tenancy/organization/settings', { default_locale: 'es' })).statusCode,
    ).toBe(200);
    expect(
      (
        await patch('/tenancy/organization/settings', {
          security_policy: { session_timeout_minutes: 30 },
        })
      ).statusCode,
    ).toBe(200);

    const scoped = {
      actor_user_public_id: context.owner.public_id,
      organization_public_id: context.organization.public_id,
    };
    const profileRows = await stagedRows('tenancy.organization.update');
    expect(profileRows.map((row) => [row.severity, row.metadata])).toEqual([
      ['INFO', { changed_fields: ['name'] }],
      ['WARNING', { changed_fields: ['status'] }],
    ]);
    expect(profileRows[0]).toMatchObject(scoped);
    const settingsRows = await stagedRows('tenancy.organization_settings.update');
    expect(settingsRows.map((row) => [row.severity, row.metadata])).toEqual([
      ['INFO', { changed_fields: ['default_locale'] }],
      ['WARNING', { changed_fields: ['security_policy'] }],
    ]);
    expect(settingsRows[0]).toMatchObject(scoped);
    await expectEveryStagedRowToDrain();
  });

  it('records adding a member, changing a member, and removing a member', async () => {
    const context = await createOrganizationContext();
    const { token, organization, owner } = context;

    const added = await send({
      token,
      method: 'POST',
      path: '/tenancy/organization/memberships',
      payload: {
        email: `audit-invitee-${randomUUID()}@test.com`,
        role_id: context.memberRole.public_id,
      },
    });
    expect(added.statusCode).toBe(200);
    const invited = (
      added.json() as {
        data: { id: string; user_id: string; role_id: string; invitation: { id: string } | null };
      }
    ).data;

    const { member, membership } = await addActiveMember(context);
    const suspended = await send({
      token,
      method: 'PATCH',
      path: `/tenancy/organization/memberships/${membership.public_id}`,
      payload: { status: 'SUSPENDED' },
    });
    expect(suspended.statusCode).toBe(200);
    const removed = await send({
      token,
      method: 'DELETE',
      path: `/tenancy/organization/memberships/${membership.public_id}`,
    });
    expect(removed.statusCode).toBe(204);

    const base = {
      actor_user_public_id: owner.public_id,
      organization_public_id: organization.public_id,
      severity: 'INFO',
    };
    expect(await stagedRows('tenancy.membership.create')).toEqual([
      expect.objectContaining({
        ...base,
        target_user_public_id: invited.user_id,
        metadata: {
          membership_public_id: invited.id,
          role_public_id: invited.role_id,
          invitation_public_id: invited.invitation?.id ?? null,
        },
      }),
    ]);
    expect(await stagedRows('tenancy.membership.update')).toEqual([
      expect.objectContaining({
        ...base,
        target_user_public_id: member.public_id,
        metadata: {
          membership_public_id: membership.public_id,
          role_public_id: context.memberRole.public_id,
          changed_fields: ['status'],
        },
      }),
    ]);
    expect(await stagedRows('tenancy.membership.delete')).toEqual([
      expect.objectContaining({
        ...base,
        metadata: { membership_public_id: membership.public_id },
      }),
    ]);
    await expectEveryStagedRowToDrain();
  });

  it("records invitation resend and revoke, and an acceptance in the joined organization's log", async () => {
    const context = await createOrganizationContext();
    const { token, organization, owner } = context;

    const added = await send({
      token,
      method: 'POST',
      path: '/tenancy/organization/memberships',
      payload: {
        email: `audit-resend-${randomUUID()}@test.com`,
        role_id: context.memberRole.public_id,
      },
    });
    expect(added.statusCode).toBe(200);
    const invitationId = (added.json() as { data: { invitation: { id: string } } }).data.invitation
      .id;
    expect(
      (
        await send({
          token,
          method: 'POST',
          path: `/tenancy/organization/invitations/${invitationId}/resend`,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await send({
          token,
          method: 'DELETE',
          path: `/tenancy/organization/invitations/${invitationId}`,
        })
      ).statusCode,
    ).toBe(204);

    // Acceptance needs the raw token, which only ever leaves in the invitation email — so this
    // invitation is minted the way the membership integration suite mints one.
    const invitee = await createTestUser({ isEmailVerified: true });
    const [inviteeMembership] = await getOperatorDatabase()
      .insert(memberships)
      .values({
        public_id: generatePublicId('membership'),
        user_id: invitee.id,
        organization_id: organization.id,
        role_id: context.memberRole.id,
        status: 'INVITED',
      })
      .returning();
    const rawToken = `audit-accept-${randomUUID()}`;
    const pending = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: organization.public_id }),
      callback: () =>
        new MemberInvitationRepository().create({
          membership_id: inviteeMembership!.id,
          email: invitee.email,
          token_hash: hashInvitationToken(rawToken),
          invited_by_user_id: owner.id,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000),
          created_by_user_id: owner.id,
        }),
    });
    const accepted = await send({
      token: await generateTestToken({ userId: invitee.public_id }),
      method: 'POST',
      path: `/tenancy/invitations/${pending.public_id}/accept`,
      payload: { token: rawToken },
    });
    expect(accepted.statusCode).toBe(200);

    const byOwner = {
      actor_user_public_id: owner.public_id,
      organization_public_id: organization.public_id,
      metadata: { invitation_public_id: invitationId },
    };
    expect(await stagedRows('tenancy.member_invitation.resend')).toEqual([
      expect.objectContaining(byOwner),
    ]);
    expect(await stagedRows('tenancy.member_invitation.revoke')).toEqual([
      expect.objectContaining(byOwner),
    ]);
    // The invitee had no organization in their token; the row belongs to the organization joined.
    expect(await stagedRows('tenancy.member_invitation.accept')).toEqual([
      expect.objectContaining({
        actor_user_public_id: invitee.public_id,
        organization_public_id: organization.public_id,
        metadata: {
          invitation_public_id: pending.public_id,
          membership_public_id: inviteeMembership!.public_id,
        },
      }),
    ]);
    await expectEveryStagedRowToDrain();
  });

  it('records a member leaving, and an ownership transfer at WARNING', async () => {
    const context = await createOrganizationContext();
    const { organization, owner } = context;
    const { member: leaver } = await addActiveMember(context);
    const { member: newOwner, membership: newOwnerMembership } = await addActiveMember(context);

    const left = await send({
      token: await generateTestToken({
        userId: leaver.public_id,
        organizationPublicId: organization.public_id,
      }),
      method: 'POST',
      path: '/tenancy/organization/leave',
    });
    expect(left.statusCode).toBe(200);
    const transferred = await send({
      token: context.token,
      method: 'POST',
      path: '/tenancy/organization/transfer-ownership',
      payload: { new_owner_user_id: newOwner.public_id },
    });
    expect(transferred.statusCode).toBe(200);

    expect(await stagedRows('tenancy.membership.leave')).toEqual([
      expect.objectContaining({
        actor_user_public_id: leaver.public_id,
        organization_public_id: organization.public_id,
        severity: 'INFO',
      }),
    ]);
    expect(await stagedRows('tenancy.membership.transfer_ownership')).toEqual([
      expect.objectContaining({
        actor_user_public_id: owner.public_id,
        organization_public_id: organization.public_id,
        target_user_public_id: newOwner.public_id,
        severity: 'WARNING',
        metadata: { membership_public_id: newOwnerMembership.public_id },
      }),
    ]);
    await expectEveryStagedRowToDrain();
  });

  it('records role creation with the role id, and a role-permission replacement', async () => {
    const { token, organization, owner } = await createOrganizationContext();

    const created = await send({
      token,
      method: 'POST',
      path: '/tenancy/organization/roles',
      payload: { name: `Auditors ${randomUUID().slice(0, 8)}` },
    });
    expect(created.statusCode).toBe(200);
    const roleId = (created.json() as { data: { id: string } }).data.id;
    const replaced = await send({
      token,
      method: 'PUT',
      path: `/tenancy/organization/roles/${roleId}/permissions`,
      payload: { permission_codes: [TENANCY_PERMISSIONS.MEMBERSHIP_READ] },
    });
    expect(replaced.statusCode).toBe(200);

    const scoped = {
      actor_user_public_id: owner.public_id,
      organization_public_id: organization.public_id,
    };
    // The role id used to be read from a field the response never has, so every row was `{}`.
    expect(await stagedRows('tenancy.role.create')).toEqual([
      expect.objectContaining({ ...scoped, metadata: { role_public_id: roleId } }),
    ]);
    expect(await stagedRows('tenancy.role_permissions.put')).toEqual([
      expect.objectContaining({
        ...scoped,
        metadata: {
          role_public_id: roleId,
          permission_codes: [TENANCY_PERMISSIONS.MEMBERSHIP_READ],
        },
      }),
    ]);
    await expectEveryStagedRowToDrain();
  });

  it('records notification-policy create, update and delete', async () => {
    const { token, organization, owner } = await createOrganizationContext();

    const created = await send({
      token,
      method: 'POST',
      path: '/tenancy/organization/notification-policies',
      payload: { notification_type: 'security.alert', channel: 'EMAIL' },
    });
    expect(created.statusCode).toBe(200);
    const policyId = (created.json() as { data: { id: string } }).data.id;
    expect(
      (
        await send({
          token,
          method: 'PATCH',
          path: `/tenancy/organization/notification-policies/${policyId}`,
          payload: { default_enabled: false },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await send({
          token,
          method: 'DELETE',
          path: `/tenancy/organization/notification-policies/${policyId}`,
        })
      ).statusCode,
    ).toBe(204);

    for (const action of [
      'tenancy.notification_policy.create',
      'tenancy.notification_policy.update',
      'tenancy.notification_policy.delete',
    ]) {
      expect(await stagedRows(action)).toEqual([
        expect.objectContaining({
          actor_user_public_id: owner.public_id,
          organization_public_id: organization.public_id,
          metadata: expect.objectContaining({ notification_policy_public_id: policyId }),
        }),
      ]);
    }
    await expectEveryStagedRowToDrain();
  });

  it("shows API-key creation in the organization's own audit log", async () => {
    const { token, organization, owner } = await createOrganizationContext();

    const minted = await send({
      token,
      method: 'POST',
      path: '/tenancy/organization/api-keys',
      payload: { name: 'audit-visible', scopes: [TENANCY_PERMISSIONS.MEMBERSHIP_READ] },
    });
    expect(minted.statusCode).toBe(200);
    const keyId = (minted.json() as { data: { api_key: { id: string } } }).data.api_key.id;

    expect(await stagedRows('organization.api_key.create')).toEqual([
      expect.objectContaining({
        actor_user_public_id: owner.public_id,
        organization_public_id: organization.public_id,
        metadata: { api_key_id: keyId },
      }),
    ]);
    await expectEveryStagedRowToDrain();

    // The admin-facing proof: the organization's audit-log listing returns the row.
    const listed = await send({ token, method: 'GET', path: '/tenancy/organization/audit-logs' });
    expect(listed.statusCode).toBe(200);
    const actions = (listed.json() as { data: { action: string }[] }).data.map((row) => row.action);
    expect(actions).toContain('organization.api_key.create');
  });

  it("records an organization's creation in its own log, and its deletion at WARNING", async () => {
    const { token, organization, owner } = await createOrganizationContext();

    const created = await send({
      token,
      method: 'POST',
      path: '/tenancy/organizations',
      payload: { name: 'Second Clinic', slug: `second-clinic-${randomUUID().slice(0, 8)}` },
    });
    expect(created.statusCode).toBe(200);
    const createdId = (created.json() as { data: { id: string } }).data.id;
    const deleted = await send({ token, method: 'DELETE', path: '/tenancy/organization' });
    expect(deleted.statusCode).toBe(204);

    expect(await stagedRows('tenancy.organization.create')).toEqual([
      expect.objectContaining({
        actor_user_public_id: owner.public_id,
        organization_public_id: createdId,
        severity: 'INFO',
      }),
    ]);
    expect(await stagedRows('tenancy.organization.delete')).toEqual([
      expect.objectContaining({
        actor_user_public_id: owner.public_id,
        organization_public_id: organization.public_id,
        severity: 'WARNING',
      }),
    ]);
    // The tombstoned organization still resolves, so its deletion row is not lost in the drain.
    await expectEveryStagedRowToDrain();
  });
});
