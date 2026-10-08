import { describe, it, expect, beforeEach } from 'vitest';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedAllPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { MembershipRepository } from '@/domains/tenancy/sub-domains/membership/membership.repository.js';

describe('MembershipRepository (database)', () => {
  const repository = new MembershipRepository();

  beforeEach(async () => {
    await cleanupDatabase();
    // `tenancy.permissions` is reference data that NO migration seeds, and
    // `cleanupDatabase()` exempts the table from its TRUNCATE. Without this the suite
    // passes only when an earlier file happened to seed it, and fails on a fresh
    // database with a role_permissions -> permissions FK violation.
    await seedAllPermissions();
  });

  it('creates and queries memberships by organization and user', async () => {
    const owner = await createTestUser();
    const member = await createTestUser({ email: 'member-db@test.com' });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: ['organization:read'],
    });
    const membership = await createMembership({
      userId: member.id,
      organizationId: organization.id,
      roleId: role.id,
    });

    const page = await repository.list(organization.id, { limit: 20 });
    expect(page.items.some((row) => row.public_id === membership.public_id)).toBe(true);

    const byPublicId = await repository.findByPublicId(membership.public_id, organization.id);
    expect(byPublicId?.user_id).toBe(member.id);

    const byUser = await repository.findByUserAndOrganization(member.id, organization.id);
    expect(byUser?.public_id).toBe(membership.public_id);

    const byId = await repository.findById(membership.id);
    expect(byId?.public_id).toBe(membership.public_id);

    const updated = await repository.update(
      membership.public_id,
      organization.id,
      { status: 'active' },
      owner.id,
    );
    expect(updated?.status).toBe('active');
    expect(updated?.joined_at).not.toBeNull();

    const deleted = await repository.softDelete(membership.public_id, organization.id);
    expect(deleted?.deleted_at).not.toBeNull();

    const afterDelete = await repository.findByPublicId(membership.public_id, organization.id);
    expect(afterDelete).toBeNull();
  });

  it('q search filters members by email / name via the SECURITY DEFINER resolver', async () => {
    const owner = await createTestUser({ email: 'search-owner@test.com' });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: ['organization:read'],
    });
    const alice = await createTestUser({
      email: 'alice.smith@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
    });
    const bob = await createTestUser({
      email: 'bob.jones@example.com',
      firstName: 'Bob',
      lastName: 'Jones',
    });
    const aliceMembership = await createMembership({
      userId: alice.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    await createMembership({ userId: bob.id, organizationId: organization.id, roleId: role.id });

    // Match by email fragment.
    const byEmail = await repository.list(organization.id, {
      limit: 20,
      q: 'alice.smith',
    });
    expect(byEmail.items).toHaveLength(1);
    expect(byEmail.items[0]!.public_id).toBe(aliceMembership.public_id);

    // Match by last name (case-insensitive).
    const byLastName = await repository.list(organization.id, {
      limit: 20,
      q: 'smith',
    });
    expect(byLastName.items.map((row) => row.public_id)).toEqual([aliceMembership.public_id]);

    // Match by full "first last".
    const byFullName = await repository.list(organization.id, {
      limit: 20,
      q: 'alice sm',
    });
    expect(byFullName.items).toHaveLength(1);

    // A wildcard character in the term is escaped (matched literally), so it finds nothing.
    const escaped = await repository.list(organization.id, {
      limit: 20,
      q: 'alice%',
    });
    expect(escaped.items).toHaveLength(0);

    // No match → empty page, no cursor.
    const none = await repository.list(organization.id, { limit: 20, q: 'zzzzz' });
    expect(none.items).toHaveLength(0);
    expect(none.has_more).toBe(false);
    expect(none.next_cursor).toBeNull();
  });

  it('q search still paginates via the (created_at, id) keyset', async () => {
    const owner = await createTestUser({ email: 'page-owner@test.com' });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: ['organization:read'],
    });
    // Three members sharing the "shared" token in their email.
    for (const tag of ['a', 'b', 'c']) {
      const user = await createTestUser({ email: `shared-${tag}@example.com` });
      await createMembership({ userId: user.id, organizationId: organization.id, roleId: role.id });
    }

    const first = await repository.list(organization.id, {
      limit: 2,
      q: 'shared-',
    });
    expect(first.items).toHaveLength(2);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).not.toBeNull();

    const second = await repository.list(organization.id, {
      limit: 2,
      q: 'shared-',
      after: first.next_cursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.has_more).toBe(false);
    // No overlap between pages.
    const firstIds = new Set(first.items.map((row) => row.public_id));
    expect(second.items.every((row) => !firstIds.has(row.public_id))).toBe(true);
  });

  it('q search is organization-scoped (no cross-organization leak)', async () => {
    const ownerA = await createTestUser({ email: 'scope-owner-a@test.com' });
    const organizationA = await createTestOrganization({ ownerUserId: ownerA.id });
    const roleA = await createRoleWithPermissions({
      organizationId: organizationA.id,
      permissionCodes: ['organization:read'],
    });
    const ownerB = await createTestUser({ email: 'scope-owner-b@test.com' });
    const organizationB = await createTestOrganization({ ownerUserId: ownerB.id });
    const roleB = await createRoleWithPermissions({
      organizationId: organizationB.id,
      permissionCodes: ['organization:read'],
    });
    // Same searchable member email present in BOTH organizations.
    const shared = await createTestUser({ email: 'crossorg@example.com' });
    const inA = await createMembership({
      userId: shared.id,
      organizationId: organizationA.id,
      roleId: roleA.id,
    });
    await createMembership({
      userId: shared.id,
      organizationId: organizationB.id,
      roleId: roleB.id,
    });

    const resultA = await repository.list(organizationA.id, {
      limit: 20,
      q: 'crossorg',
    });
    expect(resultA.items).toHaveLength(1);
    expect(resultA.items[0]!.public_id).toBe(inA.public_id);
    expect(resultA.items[0]!.organization_id).toBe(organizationA.id);
  });

  it('returns null for missing memberships and supports non-active updates', async () => {
    const owner = await createTestUser({ email: 'owner-missing@example.com' });
    const invitee = await createTestUser({ email: 'invitee-missing@example.com' });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: ['organization:read'],
    });
    const membership = await createMembership({
      userId: owner.id,
      organizationId: organization.id,
      roleId: role.id,
      status: 'invited',
    });

    expect(await repository.findById(99_999)).toBeNull();
    expect(await repository.findByPublicId('missing_public_id', organization.id)).toBeNull();
    expect(await repository.findByUserAndOrganization(owner.id, 99_999)).toBeNull();

    const invited = await repository.create({
      organization_id: organization.id,
      user_id: invitee.id,
      role_id: role.id,
    });
    expect(invited.status).toBe('invited');

    const suspended = await repository.update(
      membership.public_id,
      organization.id,
      { status: 'suspended' },
      owner.id,
    );
    expect(suspended?.status).toBe('suspended');

    // T10: an invited member becomes active only by accepting the invite (which stamps
    // `joined_at`) — a plain status update is refused by chk_memberships_joined.
    await expect(
      repository.update(invited.public_id, organization.id, { status: 'active' }, owner.id),
    ).rejects.toThrow();

    const withoutStatus = await repository.update(invited.public_id, organization.id, {}, null);
    expect(withoutStatus?.status).toBe('invited');

    expect(
      await repository.update(
        'missing_membership',
        organization.id,
        { status: 'active' },
        owner.id,
      ),
    ).toBeNull();
    expect(await repository.softDelete('missing_membership', organization.id)).toBeNull();
  });

  it('route-audit-#1: activateForInvitationAccept only activates an INVITED membership', async () => {
    const owner = await createTestUser({ email: 'activate-owner@test.com' });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [],
    });

    // The legitimate accept path: a still-INVITED membership activates.
    const invitee = await createTestUser({ email: 'activate-invited@test.com' });
    const invited = await createMembership({
      userId: invitee.id,
      organizationId: organization.id,
      roleId: role.id,
      status: 'invited',
    });
    const activated = await repository.activateForInvitationAccept(invited.id, organization.id);
    expect(activated?.status).toBe('active');
    expect(activated?.joined_at).not.toBeNull();

    // The exploit: a SUSPENDED member (per-organization ban) must NOT be able to self-restore to ACTIVE
    // by accepting a still-pending invitation — activate is a no-op and the ban stands.
    const banned = await createTestUser({ email: 'activate-banned@test.com' });
    const suspended = await createMembership({
      userId: banned.id,
      organizationId: organization.id,
      roleId: role.id,
      status: 'suspended',
    });
    const rejected = await repository.activateForInvitationAccept(suspended.id, organization.id);
    expect(rejected).toBeNull();
    const stillSuspended = await repository.findById(suspended.id);
    expect(stillSuspended?.status).toBe('suspended');
  });

  it('softDelete refuses to remove the organization owner (atomic owner-guard)', async () => {
    const owner = await createTestUser({ email: 'owner-guard@test.com' });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [],
    });
    const ownerMembership = await createMembership({
      userId: owner.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    const member = await createTestUser({ email: 'regular-guard@test.com' });
    const memberMembership = await createMembership({
      userId: member.id,
      organizationId: organization.id,
      roleId: role.id,
    });

    // Removing the owner's membership would orphan the organization — the guard blocks it.
    expect(await repository.softDelete(ownerMembership.public_id, organization.id)).toBeNull();
    const ownerStillActive = await repository.findByPublicId(
      ownerMembership.public_id,
      organization.id,
    );
    expect(ownerStillActive?.deleted_at).toBeNull();

    // A non-owner member is removed normally.
    const deleted = await repository.softDelete(memberMembership.public_id, organization.id);
    expect(deleted?.public_id).toBe(memberMembership.public_id);
  });
});
