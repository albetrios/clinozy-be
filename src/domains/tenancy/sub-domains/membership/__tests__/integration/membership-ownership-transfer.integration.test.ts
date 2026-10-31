import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
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
  seedAllPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { provisionOrganizationWithOwner } from '@/domains/tenancy/sub-domains/organization/organization-provisioning.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { membership_additional_roles } from '@/domains/tenancy/sub-domains/membership/membership-additional-roles/membership-additional-roles.schema.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

/**
 * B2-1: an ownership transfer hands over the Owner role, not only `owner_user_id` — the former
 * owner moves to Admin (or the role the request names) and loses the Owner-only powers at once,
 * and the new owner can then manage them. Deleting the organization takes being its owner, not
 * only holding `organization:delete`.
 */
describe('Ownership transfer moves the Owner role (B2-1)', () => {
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

  async function roleIdByName(organizationId: number, name: string) {
    const [role] = await getOperatorDatabase()
      .select({ id: roles.id, public_id: roles.public_id })
      .from(roles)
      .where(and(eq(roles.organization_id, organizationId), eq(roles.name, name)))
      .limit(1);
    expect(role, `role ${name}`).toBeDefined();
    return role!;
  }

  async function membershipOf(userId: number, organizationId: number) {
    const [row] = await getOperatorDatabase()
      .select()
      .from(memberships)
      .where(and(eq(memberships.user_id, userId), eq(memberships.organization_id, organizationId)))
      .limit(1);
    expect(row).toBeDefined();
    return row!;
  }

  async function extraRoleIdsOf(membershipId: number) {
    const rows = await getOperatorDatabase()
      .select({ role_id: membership_additional_roles.role_id })
      .from(membership_additional_roles)
      .where(eq(membership_additional_roles.membership_id, membershipId))
      .orderBy(asc(membership_additional_roles.position));
    return rows.map((row) => row.role_id);
  }

  /** A provisioned clinic (Owner, Admin and the clinic roles) with a second, Admin member. */
  async function clinicWithAdminMember() {
    const owner = await createTestUser({ email: `owner-${randomUUID()}@test.com` });
    const clinic = await provisionOrganizationWithOwner({
      name: 'Transfer Clinic',
      slug: `transfer-${generatePublicId('organization').slice(4, 14)}`,
      type: 'TEAM',
      ownerUserId: owner.id,
    });
    const organization = clinic.organization;
    const adminRole = await roleIdByName(organization.id, 'Admin');
    const successor = await createTestUser({ email: `successor-${randomUUID()}@test.com` });
    await createMembership({
      userId: successor.id,
      organizationId: organization.id,
      roleId: adminRole.id,
    });
    const ownerToken = await generateTestToken({
      userId: owner.public_id,
      organizationPublicId: organization.public_id,
      stepUp: true,
    });
    return { owner, successor, organization, ownerRoleId: clinic.roleId, adminRole, ownerToken };
  }

  function transfer(options: { token: string; payload: Record<string, unknown> }) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/tenancy/organization/transfer-ownership'),
      token: options.token,
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      payload: options.payload,
    });
  }

  it('gives the new owner the Owner role and moves the former owner to Admin', async () => {
    const { owner, successor, organization, ownerRoleId, adminRole, ownerToken } =
      await clinicWithAdminMember();

    const response = await transfer({
      token: ownerToken,
      payload: { new_owner_user_id: successor.public_id },
    });
    expect(response.statusCode, response.body).toBe(200);

    const [after] = await getOperatorDatabase()
      .select({ owner_user_id: organizations.owner_user_id })
      .from(organizations)
      .where(eq(organizations.id, organization.id));
    expect(after!.owner_user_id).toBe(successor.id);
    const newOwnerMembership = await membershipOf(successor.id, organization.id);
    expect(newOwnerMembership.role_id).toBe(ownerRoleId);
    // Their previous main role stays as an extra role.
    expect(await extraRoleIdsOf(newOwnerMembership.id)).toEqual([adminRole.id]);
    const formerOwnerMembership = await membershipOf(owner.id, organization.id);
    expect(formerOwnerMembership.role_id).toBe(adminRole.id);
    expect(await extraRoleIdsOf(formerOwnerMembership.id)).not.toContain(ownerRoleId);
  });

  it('refuses the former owner organization:delete at once, and lets the new owner remove them', async () => {
    const { owner, successor, organization, ownerToken } = await clinicWithAdminMember();
    const transferred = await transfer({
      token: ownerToken,
      payload: { new_owner_user_id: successor.public_id },
    });
    expect(transferred.statusCode, transferred.body).toBe(200);

    const formerOwnerToken = await generateTestToken({
      userId: owner.public_id,
      organizationPublicId: organization.public_id,
      stepUp: true,
    });
    const deleteAttempt = await injectAuthenticated(app, {
      method: 'DELETE',
      url: testApiPath('/tenancy/organization'),
      token: formerOwnerToken,
    });
    expect(deleteAttempt.statusCode, deleteAttempt.body).toBe(403);

    // The new owner holds every code the former owner holds now, so role ordering lets them act.
    const newOwnerToken = await generateTestToken({
      userId: successor.public_id,
      organizationPublicId: organization.public_id,
    });
    const formerOwnerMembership = await membershipOf(owner.id, organization.id);
    const removal = await injectAuthenticated(app, {
      method: 'DELETE',
      url: testApiPath(
        `/tenancy/organization/memberships/${formerOwnerMembership.public_id}?reason=not_needed`,
      ),
      token: newOwnerToken,
    });
    expect(removal.statusCode, removal.body).toBe(204);
  });

  it('moves the former owner to the role the request names — subscription:manage is then refused', async () => {
    const { owner, successor, organization, ownerToken } = await clinicWithAdminMember();
    const doctorRole = await roleIdByName(organization.id, 'Doctor');

    const response = await transfer({
      token: ownerToken,
      payload: {
        new_owner_user_id: successor.public_id,
        former_owner_role_id: doctorRole.public_id,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect((await membershipOf(owner.id, organization.id)).role_id).toBe(doctorRole.id);

    const unknownSubscription = generatePublicId('subscription');
    const cancelAs = async (userPublicId: string) =>
      injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath(`/billing/subscriptions/${unknownSubscription}/cancel`),
        token: await generateTestToken({
          userId: userPublicId,
          organizationPublicId: organization.public_id,
        }),
        headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
        payload: {},
      });
    const formerOwnerCancel = await cancelAs(owner.public_id);
    expect(formerOwnerCancel.statusCode, formerOwnerCancel.body).toBe(403);
    // The new owner passes the permission gate (and finds no such subscription).
    const newOwnerCancel = await cancelAs(successor.public_id);
    expect(newOwnerCancel.statusCode, newOwnerCancel.body).toBe(404);
  });

  it('refuses the Owner role itself as former_owner_role_id (400) and changes nothing', async () => {
    const { owner, successor, organization, ownerRoleId, ownerToken } =
      await clinicWithAdminMember();
    const ownerRole = await getOperatorDatabase()
      .select({ public_id: roles.public_id })
      .from(roles)
      .where(eq(roles.id, ownerRoleId));

    const response = await transfer({
      token: ownerToken,
      payload: {
        new_owner_user_id: successor.public_id,
        former_owner_role_id: ownerRole[0]!.public_id,
      },
    });
    expect(response.statusCode, response.body).toBe(400);
    const [after] = await getOperatorDatabase()
      .select({ owner_user_id: organizations.owner_user_id })
      .from(organizations)
      .where(eq(organizations.id, organization.id));
    expect(after!.owner_user_id).toBe(owner.id);
  });

  it('refuses DELETE /tenancy/organization to a non-owner who holds organization:delete (403 owner_only)', async () => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const deleter = await createTestUser();
    const deleteRole = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [
        TENANCY_PERMISSIONS.ORGANIZATION_DELETE,
        TENANCY_PERMISSIONS.ORGANIZATION_READ,
      ],
    });
    await createMembership({
      userId: deleter.id,
      organizationId: organization.id,
      roleId: deleteRole.id,
    });
    const token = await generateTestToken({
      userId: deleter.public_id,
      organizationPublicId: organization.public_id,
      stepUp: true,
    });

    const response = await injectAuthenticated(app, {
      method: 'DELETE',
      url: testApiPath('/tenancy/organization'),
      token,
    });
    expect(response.statusCode, response.body).toBe(403);
    expect((response.json() as { error: { reason?: string } }).error.reason).toBe('owner_only');
    const [after] = await getOperatorDatabase()
      .select({
        deleted_at: organizations.deleted_at,
        deletion_started_at: organizations.deletion_started_at,
      })
      .from(organizations)
      .where(eq(organizations.id, organization.id));
    expect(after!.deleted_at).toBeNull();
    expect(after!.deletion_started_at).toBeNull();
  });
});
