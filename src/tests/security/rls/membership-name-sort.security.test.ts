import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import {
  grantClinozyBeAppRoleForTests,
  executeAsClinozyBeAppTenant,
} from '@/tests/helpers/rls-matrix.helper.js';

/**
 * Regression guard for sorting the members list by name under FORCE RLS (launch K3).
 *
 * The member's name used to come from `auth.users` — a FORCE ROW LEVEL SECURITY table behind a
 * self-owner policy keyed on `app.current_user_public_id` — so under the organization-only context
 * the list runs in, a join to it resolves to ZERO rows as the non-superuser `clinozy_be_app` role
 * (a SECURITY DEFINER resolver worked around it until launch #126). The name now lives on the
 * membership itself (`tenancy.memberships.display_name`, kept by `trg_memberships_display_name` and
 * `trg_users_sync_membership_display_names`), so the list sorts and pages on its own row with the
 * `(display_name, id)` keyset and needs no join.
 *
 * These tests run as `clinozy_be_app` precisely because the local/CI default superuser is RLS-exempt
 * and would hide a regression to the join.
 */
function orderedRowsFromResult(result: unknown): Array<{ id: number; display_name: string }> {
  const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as {
    id: number | string;
    display_name: string;
  }[];
  return rows.map((row) => ({ id: Number(row.id), display_name: row.display_name }));
}

function scalarFromResult<T>(result: unknown, key: string): T {
  const rows = (
    Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  ) as Record<string, unknown>[];
  return rows[0]?.[key] as T;
}

describe('Security: member name sort under FORCE RLS', () => {
  beforeAll(async () => {
    await grantClinozyBeAppRoleForTests();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  /** An organization with three members named so their order is known. */
  async function organizationWithThreeMembers(prefix: string) {
    const owner = await createTestUser({
      email: `${prefix}-owner@example.com`,
      firstName: 'Mallory',
      lastName: 'Owner',
    });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [],
      createdByUserId: owner.id,
    });
    const ownerMembership = await createMembership({
      userId: owner.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    const alice = await createTestUser({
      email: `${prefix}-alice@example.com`,
      firstName: 'Alice',
      lastName: 'Anderson',
    });
    const aliceMembership = await createMembership({
      userId: alice.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    const zoe = await createTestUser({
      email: `${prefix}-zoe@example.com`,
      firstName: 'Zoe',
      lastName: 'Zimmer',
    });
    const zoeMembership = await createMembership({
      userId: zoe.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    return { organization, ownerMembership, aliceMembership, zoeMembership };
  }

  it('orders the members by their own display name under organization-only context, where a join to auth.users is RLS-blocked to 0 rows', async () => {
    const { organization, ownerMembership, aliceMembership, zoeMembership } =
      await organizationWithThreeMembers('sort');

    await executeAsClinozyBeAppTenant(organization.public_id, async (transaction) => {
      // The join the name used to need is RLS-blocked to 0 rows — why the name lives on the row.
      const rawJoinCount = await transaction.execute(
        drizzleSql`SELECT count(*)::int AS count
                   FROM tenancy.memberships AS m
                   JOIN auth.users AS u ON u.id = m.user_id
                   WHERE m.organization_id = ${organization.id}`,
      );
      expect(scalarFromResult<number>(rawJoinCount, 'count')).toBe(0);

      // Ascending by display name: Alice Anderson < Mallory Owner < Zoe Zimmer.
      const ascending = await transaction.execute(
        drizzleSql`SELECT id, display_name FROM tenancy.memberships
                   WHERE organization_id = ${organization.id} AND deleted_at IS NULL
                   ORDER BY display_name, id`,
      );
      expect(orderedRowsFromResult(ascending).map((row) => row.id)).toEqual([
        aliceMembership.id,
        ownerMembership.id,
        zoeMembership.id,
      ]);

      // Descending reverses the order.
      const descending = await transaction.execute(
        drizzleSql`SELECT id, display_name FROM tenancy.memberships
                   WHERE organization_id = ${organization.id} AND deleted_at IS NULL
                   ORDER BY display_name DESC, id DESC`,
      );
      expect(orderedRowsFromResult(descending).map((row) => row.id)).toEqual([
        zoeMembership.id,
        ownerMembership.id,
        aliceMembership.id,
      ]);
    });
  });

  it('pages by the (display_name, id) keyset: the second page starts after the boundary', async () => {
    const { organization, zoeMembership } = await organizationWithThreeMembers('keyset');

    await executeAsClinozyBeAppTenant(organization.public_id, async (transaction) => {
      const firstPage = await transaction.execute(
        drizzleSql`SELECT id, display_name FROM tenancy.memberships
                   WHERE organization_id = ${organization.id} AND deleted_at IS NULL
                   ORDER BY display_name, id LIMIT 1`,
      );
      const first = orderedRowsFromResult(firstPage);
      expect(first).toHaveLength(1);
      const boundary = first[0]!;

      const secondPage = await transaction.execute(
        drizzleSql`SELECT id, display_name FROM tenancy.memberships
                   WHERE organization_id = ${organization.id} AND deleted_at IS NULL
                     AND (display_name, id) > (${boundary.display_name}, ${boundary.id}::bigint)
                   ORDER BY display_name, id LIMIT 50`,
      );
      const secondIds = orderedRowsFromResult(secondPage).map((row) => row.id);
      expect(secondIds).not.toContain(boundary.id);
      expect(secondIds).toContain(zoeMembership.id);
      expect(secondIds).toHaveLength(2);
    });
  });

  it('is organization-scoped: one organization’s context never sees another organization’s members', async () => {
    const first = await organizationWithThreeMembers('first');
    const second = await organizationWithThreeMembers('second');

    await executeAsClinozyBeAppTenant(first.organization.public_id, async (transaction) => {
      const visible = await transaction.execute(
        drizzleSql`SELECT id, display_name FROM tenancy.memberships ORDER BY display_name, id`,
      );
      const ids = orderedRowsFromResult(visible).map((row) => row.id);
      expect(ids).toHaveLength(3);
      expect(ids).not.toContain(second.aliceMembership.id);
      expect(ids).not.toContain(second.ownerMembership.id);
    });
  });
});
