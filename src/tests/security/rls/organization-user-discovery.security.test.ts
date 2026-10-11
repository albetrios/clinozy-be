import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { sql as drizzleSql, and, eq, isNull } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { membership_invitations } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.schema.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { notifications } from '@/domains/notify/sub-domains/notification/notification.schema.js';
import { createTestNotification } from '@/tests/factories/notification.factory.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { grantClinozyBeAppRoleForTests } from '@/tests/helpers/rls-matrix.helper.js';
import { setLocalApplicationRole } from '@/infrastructure/database/contexts/database-context-runtime.js';

/** Rows of a `database.execute()` result. */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []);
}

/**
 * Validates the user-discovery RLS policies and SECURITY DEFINER lookups that
 * unblock cross-organization and user-driven routes (migration
 * `20260520000004_organization_discovery_and_invitation_lookup_rls.sql`).
 *
 * The fix-under-test is twofold:
 *   1. `organizations_user_discovery` + `memberships_user_self_discovery` PERMISSIVE
 *      policies grant access ONLY when `app.current_user_public_id` matches the row owner
 *      or an active membership. Existing `*_tenant_isolation` policies are unchanged.
 *   2. `tenancy.resolve_membership_invitation_lookup_by_public_id` and
 *      `tenancy.list_pending_membership_invitations_for_email` SECURITY DEFINER helpers
 *      let the invitation accept route resolve the owning organization
 *      without an active `app.current_organization_public_id` GUC, then wrap the actual write
 *      in `withAppDatabaseContext`.
 *
 * All assertions run under `clinozy_be_app` so RLS is enforced (the test runner role
 * the Compose superuser typically inherits BYPASSRLS, which would mask regressions).
 */

async function executeAsClinozyBeAppUser<T>(
  userPublicId: string | null,
  callback: (transaction: typeof database) => Promise<T>,
): Promise<T> {
  return database.transaction(async (transaction) => {
    await setLocalApplicationRole(transaction);
    const value = userPublicId ?? '';
    await transaction.execute(
      drizzleSql`SELECT set_config('app.current_user_public_id', ${value}, true)`,
    );
    return callback(transaction as unknown as typeof database);
  });
}

describe('Security: organization user-discovery RLS + invitation SECURITY DEFINER lookups', () => {
  beforeAll(async () => {
    await grantClinozyBeAppRoleForTests();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('owner sees their own organization under app.current_user_public_id (organizations_user_discovery)', async () => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });

    const rows = await executeAsClinozyBeAppUser(owner.public_id, (transaction) =>
      transaction
        .select({ public_id: organizations.public_id })
        .from(organizations)
        .where(eq(organizations.public_id, organization.public_id)),
    );
    expect(rows).toHaveLength(1);
  });

  it('active member sees member organization under app.current_user_public_id', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [],
    });
    await createMembership({
      userId: member.id,
      organizationId: organization.id,
      roleId: role.id,
    });

    const rows = await executeAsClinozyBeAppUser(member.public_id, (transaction) =>
      transaction
        .select({ public_id: organizations.public_id })
        .from(organizations)
        .where(eq(organizations.public_id, organization.public_id)),
    );
    expect(rows).toHaveLength(1);
  });

  it('non-member with valid user context cannot see another tenant organization', async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });

    const rows = await executeAsClinozyBeAppUser(stranger.public_id, (transaction) =>
      transaction
        .select({ public_id: organizations.public_id })
        .from(organizations)
        .where(eq(organizations.public_id, organization.public_id)),
    );
    expect(rows).toHaveLength(0);
  });

  it('unset user context blocks organization SELECT (tenant-isolation policy still gates)', async () => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });

    const rows = await executeAsClinozyBeAppUser(null, (transaction) =>
      transaction
        .select({ public_id: organizations.public_id })
        .from(organizations)
        .where(eq(organizations.public_id, organization.public_id)),
    );
    expect(rows).toHaveLength(0);
  });

  it('user sees own memberships under app.current_user_public_id (memberships_user_self_discovery)', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [],
    });
    await createMembership({
      userId: member.id,
      organizationId: organization.id,
      roleId: role.id,
    });

    const rows = await executeAsClinozyBeAppUser(member.public_id, (transaction) =>
      transaction
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.organization_id, organization.id),
            eq(memberships.user_id, member.id),
            isNull(memberships.deleted_at),
          ),
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('resolve_membership_invitation_lookup_by_public_id returns owning organization without organization context', async () => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [],
    });
    const membership = await createMembership({
      userId: owner.id,
      organizationId: organization.id,
      roleId: role.id,
    });

    /**
     * Seed an invitation via the SECURITY DEFINER-friendly path: we are running as
     * the migrations role (superuser-equivalent in test), which lets the INSERT
     * happen. The lookup must return the membership's owning organization.
     */
    const invitationPublicId = `inv_${Math.random().toString(36).slice(2, 12)}`;
    await database.insert(membership_invitations).values({
      public_id: invitationPublicId,
      membership_id: membership.id,
      email: 'invitee@example.com',
      token_hash: 'token-hash-placeholder',
      invited_by_user_id: owner.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const rows = rowsOf<{
      organization_public_id: string;
      organization_id: string | number;
      membership_public_id: string;
      membership_id: string | number;
    }>(
      await database.execute(drizzleSql`
      SELECT organization_public_id, organization_id, membership_public_id, membership_id
      FROM tenancy.resolve_membership_invitation_lookup_by_public_id(${invitationPublicId})
    `),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.organization_public_id).toBe(organization.public_id);
    expect(rows[0]?.membership_public_id).toBe(membership.public_id);
  });

  it('list_pending_membership_invitations_for_email returns each invited membership’s latest live invitation across organizations', async () => {
    const owners = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    const invitee = await createTestUser();
    const invitedIn = await Promise.all(
      owners.map(async (owner) => {
        const organization = await createTestOrganization({ ownerUserId: owner.id });
        const role = await createRoleWithPermissions({
          organizationId: organization.id,
          permissionCodes: [],
        });
        // An invitation's membership waits as `invited` until it is answered (launch D84).
        const membership = await createMembership({
          userId: invitee.id,
          organizationId: organization.id,
          roleId: role.id,
          status: MEMBERSHIP_STATUS.INVITED,
        });
        return { owner, organization, membership };
      }),
    );
    const [inA, inB, inC] = invitedIn as [
      (typeof invitedIn)[number],
      (typeof invitedIn)[number],
      (typeof invitedIn)[number],
    ];
    const invitationEmail = `invitee-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const hour = 60 * 60 * 1000;
    const invitation = (options: {
      membershipId: number;
      invitedBy: number;
      token: string;
      createdAt?: Date;
      expiresAt?: Date;
    }) => ({
      public_id: `inv_${Math.random().toString(36).slice(2, 12)}`,
      membership_id: options.membershipId,
      email: invitationEmail,
      token_hash: options.token,
      invited_by_user_id: options.invitedBy,
      ...(options.createdAt ? { created_at: options.createdAt } : {}),
      expires_at: options.expiresAt ?? new Date(Date.now() + 7 * 24 * hour),
    });
    const latestInA = invitation({
      membershipId: inA.membership.id,
      invitedBy: inA.owner.id,
      token: 'hash-a-latest',
    });

    await database.insert(membership_invitations).values([
      // Sent again: only the latest invitation of a membership counts.
      invitation({
        membershipId: inA.membership.id,
        invitedBy: inA.owner.id,
        token: 'hash-a-earlier',
        createdAt: new Date(Date.now() - hour),
      }),
      latestInA,
      invitation({ membershipId: inB.membership.id, invitedBy: inB.owner.id, token: 'hash-b' }),
      /**
       * Expired invitation must be filtered out by
       * `list_pending_membership_invitations_for_email`. `created_at` is
       * pinned earlier than `expires_at` so the `chk_membership_invitations_expires`
       * check constraint (`expires_at > created_at`) still holds while
       * the row remains past its `expires_at`.
       */
      invitation({
        membershipId: inC.membership.id,
        invitedBy: inC.owner.id,
        token: 'hash-expired',
        createdAt: new Date(Date.now() - 48 * hour),
        expiresAt: new Date(Date.now() - 24 * hour),
      }),
    ]);

    const rows = rowsOf<{
      invitation_public_id: string;
      organization_public_id: string;
    }>(
      await database.execute(drizzleSql`
      SELECT invitation_public_id, organization_public_id
      FROM tenancy.list_pending_membership_invitations_for_email(${invitationEmail}, 100)
    `),
    );
    expect(rows).toHaveLength(2);
    const organizationIds = new Set(rows.map((row) => row.organization_public_id));
    expect(organizationIds.has(inA.organization.public_id)).toBe(true);
    expect(organizationIds.has(inB.organization.public_id)).toBe(true);
    expect(organizationIds.has(inC.organization.public_id)).toBe(false);
    expect(
      rows.find((row) => row.organization_public_id === inA.organization.public_id)
        ?.invitation_public_id,
    ).toBe(latestInA.public_id);
  });

  describe('the user identity alone grants no organization or membership writes', () => {
    async function createMemberOfOrganization() {
      const owner = await createTestUser();
      const member = await createTestUser();
      const organization = await createTestOrganization({ ownerUserId: owner.id });
      const role = await createRoleWithPermissions({
        organizationId: organization.id,
        permissionCodes: [],
      });
      const membership = await createMembership({
        userId: member.id,
        organizationId: organization.id,
        roleId: role.id,
      });
      return { owner, member, organization, role, membership };
    }

    it('a member can neither take ownership of the organization nor delete it', async () => {
      const { member, organization } = await createMemberOfOrganization();

      const updated = await executeAsClinozyBeAppUser(member.public_id, (transaction) =>
        transaction
          .update(organizations)
          .set({ owner_user_id: member.id })
          .where(eq(organizations.id, organization.id))
          .returning({ id: organizations.id }),
      );
      expect(updated).toEqual([]);

      const deleted = await executeAsClinozyBeAppUser(member.public_id, (transaction) =>
        transaction
          .delete(organizations)
          .where(eq(organizations.id, organization.id))
          .returning({ id: organizations.id }),
      );
      expect(deleted).toEqual([]);
    });

    it('a member can neither rewrite nor delete their own membership', async () => {
      const { member, membership } = await createMemberOfOrganization();

      const updated = await executeAsClinozyBeAppUser(member.public_id, (transaction) =>
        transaction
          .update(memberships)
          .set({ status: MEMBERSHIP_STATUS.SUSPENDED })
          .where(eq(memberships.id, membership.id))
          .returning({ id: memberships.id }),
      );
      expect(updated).toEqual([]);

      const deleted = await executeAsClinozyBeAppUser(member.public_id, (transaction) =>
        transaction
          .delete(memberships)
          .where(eq(memberships.id, membership.id))
          .returning({ id: memberships.id }),
      );
      expect(deleted).toEqual([]);
    });

    it('a user cannot add themselves to an organization', async () => {
      const { organization, role } = await createMemberOfOrganization();
      const stranger = await createTestUser();

      await expect(
        executeAsClinozyBeAppUser(stranger.public_id, (transaction) =>
          transaction.insert(memberships).values({
            public_id: generatePublicId('memberRole'),
            user_id: stranger.id,
            organization_id: organization.id,
            role_id: role.id,
            status: MEMBERSHIP_STATUS.ACTIVE,
            joined_at: new Date(),
          }),
        ),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringMatching(/row-level security/) }),
      });
    });
  });

  describe('notification owner arms', () => {
    it('the owner reads, marks read and deletes, but cannot create or move a notification', async () => {
      const owner = await createTestUser();
      const organization = await createTestOrganization({ ownerUserId: owner.id });
      const elsewhere = await createTestOrganization({ ownerUserId: (await createTestUser()).id });
      const notification = await createTestNotification({
        userId: owner.id,
        organizationId: organization.id,
      });

      const marked = await executeAsClinozyBeAppUser(owner.public_id, (transaction) =>
        transaction
          .update(notifications)
          .set({ is_read: true, read_at: new Date() })
          .where(eq(notifications.id, notification.id))
          .returning({ id: notifications.id }),
      );
      expect(marked).toHaveLength(1);

      // The application role may change a notification's read state only.
      await expect(
        executeAsClinozyBeAppUser(owner.public_id, (transaction) =>
          transaction
            .update(notifications)
            .set({ organization_id: elsewhere.id })
            .where(eq(notifications.id, notification.id)),
        ),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringMatching(/permission denied/) }),
      });

      await expect(
        executeAsClinozyBeAppUser(owner.public_id, (transaction) =>
          transaction.insert(notifications).values({
            public_id: generatePublicId('notification'),
            user_id: owner.id,
            organization_id: elsewhere.id,
            type: 'system',
            title: 'Planted',
            message: 'Planted in another organization',
          }),
        ),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringMatching(/row-level security/) }),
      });

      const deleted = await executeAsClinozyBeAppUser(owner.public_id, (transaction) =>
        transaction
          .delete(notifications)
          .where(eq(notifications.id, notification.id))
          .returning({ id: notifications.id }),
      );
      expect(deleted).toHaveLength(1);
    });
  });
});
