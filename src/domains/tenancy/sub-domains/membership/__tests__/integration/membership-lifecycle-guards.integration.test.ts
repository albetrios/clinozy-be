import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  MEMBERSHIP_WRITE_PERMISSION_CODES,
  seedAllPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { MEMBERSHIP_DELETE_REASON } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { membership_invitations } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.schema.js';
import { users } from '@/domains/user/user.schema.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';

/** A membership manager's codes — everything about members, nothing about roles. */
const MANAGER_PERMISSIONS = [
  TENANCY_PERMISSIONS.ORGANIZATION_READ,
  TENANCY_PERMISSIONS.MEMBERSHIP_READ,
  ...MEMBERSHIP_WRITE_PERMISSION_CODES,
];

/** A role above the manager: it also edits roles. */
const SENIOR_PERMISSIONS = [...MANAGER_PERMISSIONS, TENANCY_PERMISSIONS.ROLE_UPDATE];

type ErrorBody = { error: { reason?: string } };

/**
 * The membership lifecycle guards of batch B2: restoring a removed member runs the role-escalation
 * guards (B2-2) and never brings back someone who left, deleted their account or let an invite end
 * (B2-6); an invite refused by a check provisions no login (B2-7); revoking an invite takes role
 * ordering (B2-11).
 */
describe('Membership lifecycle guards (B2-2, B2-6, B2-7, B2-11)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    app = testApplication;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedAllPermissions();
  });

  /** An owner above everyone, a lower-ranked manager, and a senior role the manager lacks codes of. */
  async function clinic() {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const ownerRole = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: SENIOR_PERMISSIONS,
    });
    await createMembership({
      userId: owner.id,
      organizationId: organization.id,
      roleId: ownerRole.id,
    });
    const managerRole = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: MANAGER_PERMISSIONS,
    });
    const manager = await createTestUser();
    await createMembership({
      userId: manager.id,
      organizationId: organization.id,
      roleId: managerRole.id,
    });
    const seniorRole = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: SENIOR_PERMISSIONS,
    });
    const tokenFor = (userPublicId: string) =>
      generateTestToken({ userId: userPublicId, organizationPublicId: organization.public_id });
    return {
      organization,
      ownerToken: await tokenFor(owner.public_id),
      managerToken: await tokenFor(manager.public_id),
      tokenFor,
      managerRole,
      seniorRole,
    };
  }

  function removeMember(options: { token: string; membershipPublicId: string }) {
    return injectAuthenticated(app, {
      method: 'DELETE',
      url: testApiPath(
        `/tenancy/organization/memberships/${options.membershipPublicId}?reason=not_needed`,
      ),
      token: options.token,
    });
  }

  function restoreMember(options: { token: string; membershipPublicId: string }) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath(`/tenancy/organization/memberships/${options.membershipPublicId}/restore`),
      token: options.token,
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      payload: {},
    });
  }

  function invite(options: { token: string; email: string; rolePublicId: string }) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/tenancy/organization/memberships'),
      token: options.token,
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      payload: { email: options.email, role_ids: [options.rolePublicId] },
    });
  }

  async function isEnded(membershipPublicId: string) {
    const [row] = await getOperatorDatabase()
      .select({ deleted_at: memberships.deleted_at })
      .from(memberships)
      .where(eq(memberships.public_id, membershipPublicId));
    return row!.deleted_at !== null;
  }

  describe('restore (B2-2)', () => {
    it('refuses a manager restoring a member whose role holds codes the manager lacks (403)', async () => {
      const { organization, ownerToken, managerToken, seniorRole } = await clinic();
      const senior = await createTestUser();
      const membership = await createMembership({
        userId: senior.id,
        organizationId: organization.id,
        roleId: seniorRole.id,
      });
      const removed = await removeMember({
        token: ownerToken,
        membershipPublicId: membership.public_id,
      });
      expect(removed.statusCode, removed.body).toBe(204);

      const byManager = await restoreMember({
        token: managerToken,
        membershipPublicId: membership.public_id,
      });
      expect(byManager.statusCode, byManager.body).toBe(403);
      expect(await isEnded(membership.public_id)).toBe(true);

      const byOwner = await restoreMember({
        token: ownerToken,
        membershipPublicId: membership.public_id,
      });
      expect(byOwner.statusCode, byOwner.body).toBe(200);
      expect(await isEnded(membership.public_id)).toBe(false);
    });
  });

  describe('restore refuses an end only the person can undo (B2-6)', () => {
    it('refuses a member who left (409 membership_not_restorable)', async () => {
      const { organization, ownerToken, managerRole, tokenFor } = await clinic();
      const leaver = await createTestUser();
      const membership = await createMembership({
        userId: leaver.id,
        organizationId: organization.id,
        roleId: managerRole.id,
      });
      const left = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/tenancy/organization/leave'),
        token: await tokenFor(leaver.public_id),
      });
      expect(left.statusCode, left.body).toBeLessThan(300);

      const response = await restoreMember({
        token: ownerToken,
        membershipPublicId: membership.public_id,
      });
      expect(response.statusCode, response.body).toBe(409);
      expect((response.json() as ErrorBody).error.reason).toBe('membership_not_restorable');
      expect(await isEnded(membership.public_id)).toBe(true);
    });

    it('refuses a member whose account was deleted (409 membership_not_restorable)', async () => {
      const { organization, ownerToken, managerRole } = await clinic();
      const departed = await createTestUser();
      const membership = await createMembership({
        userId: departed.id,
        organizationId: organization.id,
        roleId: managerRole.id,
      });
      await getOperatorDatabase()
        .update(memberships)
        .set({ deleted_at: new Date(), delete_reason: MEMBERSHIP_DELETE_REASON.ACCOUNT_DELETED })
        .where(eq(memberships.id, membership.id));

      const response = await restoreMember({
        token: ownerToken,
        membershipPublicId: membership.public_id,
      });
      expect(response.statusCode, response.body).toBe(409);
      expect((response.json() as ErrorBody).error.reason).toBe('membership_not_restorable');
    });

    it('refuses an invited member whose invite was revoked (409 membership_not_restorable)', async () => {
      const { ownerToken, managerRole } = await clinic();
      const invited = await invite({
        token: ownerToken,
        email: `revoked-${randomUUID()}@test.com`,
        rolePublicId: managerRole.public_id,
      });
      expect(invited.statusCode, invited.body).toBe(200);
      const membershipPublicId = (invited.json() as { data: { id: string } }).data.id;
      const revoked = await injectAuthenticated(app, {
        method: 'DELETE',
        url: testApiPath(`/tenancy/organization/memberships/${membershipPublicId}/invitation`),
        token: ownerToken,
      });
      expect(revoked.statusCode, revoked.body).toBe(204);

      const response = await restoreMember({ token: ownerToken, membershipPublicId });
      expect(response.statusCode, response.body).toBe(409);
      expect((response.json() as ErrorBody).error.reason).toBe('membership_not_restorable');
    });
  });

  describe('invite (B2-7)', () => {
    it('creates no login for an address whose invite the grant guard refuses', async () => {
      const { managerToken, seniorRole } = await clinic();
      const email = `never-created-${randomUUID()}@test.com`;

      const response = await invite({
        token: managerToken,
        email,
        rolePublicId: seniorRole.public_id,
      });
      expect(response.statusCode, response.body).toBe(403);
      const rows = await getOperatorDatabase()
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email));
      expect(rows).toHaveLength(0);
    });
  });

  describe('invite revoke (B2-11)', () => {
    it('refuses a manager revoking the invite of a role above them, and keeps the invite open', async () => {
      const { ownerToken, managerToken, seniorRole } = await clinic();
      const invited = await invite({
        token: ownerToken,
        email: `senior-invite-${randomUUID()}@test.com`,
        rolePublicId: seniorRole.public_id,
      });
      expect(invited.statusCode, invited.body).toBe(200);
      const membershipPublicId = (invited.json() as { data: { id: string } }).data.id;

      const byManager = await injectAuthenticated(app, {
        method: 'DELETE',
        url: testApiPath(`/tenancy/organization/memberships/${membershipPublicId}/invitation`),
        token: managerToken,
      });
      expect(byManager.statusCode, byManager.body).toBe(403);
      const [membership] = await getOperatorDatabase()
        .select({ id: memberships.id, deleted_at: memberships.deleted_at })
        .from(memberships)
        .where(eq(memberships.public_id, membershipPublicId));
      expect(membership!.deleted_at).toBeNull();
      const pending = await getOperatorDatabase()
        .select({ id: membership_invitations.id })
        .from(membership_invitations)
        .where(
          and(
            eq(membership_invitations.membership_id, membership!.id),
            isNull(membership_invitations.revoked_at),
          ),
        );
      expect(pending).toHaveLength(1);

      const byOwner = await injectAuthenticated(app, {
        method: 'DELETE',
        url: testApiPath(`/tenancy/organization/memberships/${membershipPublicId}/invitation`),
        token: ownerToken,
      });
      expect(byOwner.statusCode, byOwner.body).toBe(204);
    });
  });
});
