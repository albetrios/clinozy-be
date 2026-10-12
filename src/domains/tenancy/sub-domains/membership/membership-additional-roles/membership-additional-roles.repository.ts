import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { membership_additional_roles } from '@/domains/tenancy/sub-domains/membership/membership-additional-roles/membership-additional-roles.schema.js';

/**
 * Persistence for `tenancy.membership_additional_roles` — the roles a person holds besides their
 * main one. Runs on the request's database handle, so RLS scopes every statement to the active
 * organization.
 */
export class MembershipAdditionalRolesRepository {
  /**
   * The live additional roles of each membership, in `position` order.
   *
   * @remarks
   * - **Algorithm:** one query over all the given memberships, joined to the live roles; grouped
   *   into a map keyed by membership id (a membership with none is absent).
   * - **Failure modes:** none beyond the query.
   */
  async listRolePublicIdsByMembershipIds(
    membership_ids: readonly number[],
  ): Promise<Map<number, string[]>> {
    const byMembership = new Map<number, string[]>();
    if (membership_ids.length === 0) return byMembership;
    const rows = await getRequestDatabase()
      .select({
        membership_id: membership_additional_roles.membership_id,
        role_public_id: roles.public_id,
      })
      .from(membership_additional_roles)
      .innerJoin(roles, eq(roles.id, membership_additional_roles.role_id))
      .where(
        and(
          inArray(membership_additional_roles.membership_id, [...membership_ids]),
          isNull(roles.deleted_at),
        ),
      )
      .orderBy(
        asc(membership_additional_roles.membership_id),
        asc(membership_additional_roles.position),
      );
    for (const row of rows) {
      const list = byMembership.get(row.membership_id) ?? [];
      list.push(row.role_public_id);
      byMembership.set(row.membership_id, list);
    }
    return byMembership;
  }

  /** The internal ids of a membership's additional roles, in `position` order. */
  async listRoleIdsForMembership(membership_id: number): Promise<number[]> {
    const rows = await getRequestDatabase()
      .select({ role_id: membership_additional_roles.role_id })
      .from(membership_additional_roles)
      .where(eq(membership_additional_roles.membership_id, membership_id))
      .orderBy(asc(membership_additional_roles.position));
    return rows.map((row) => row.role_id);
  }

  /**
   * Makes `role_ids` (in order) the membership's exact additional roles.
   *
   * @remarks
   * - **Algorithm:** delete every row of the membership, then insert the list with positions
   *   1..n — the order is the point, so the rows are rewritten rather than diffed.
   * - **Failure modes:** an FK violation for a role or membership outside the organization (RLS
   *   hides them, so the service resolves ids first).
   */
  async replaceForMembership(options: {
    membership_id: number;
    organization_id: number;
    role_ids: readonly number[];
    created_by_user_id: number | null;
  }): Promise<void> {
    const database = getRequestDatabase();
    await database
      .delete(membership_additional_roles)
      .where(eq(membership_additional_roles.membership_id, options.membership_id));
    if (options.role_ids.length === 0) return;
    await database.insert(membership_additional_roles).values(
      options.role_ids.map((role_id, index) => ({
        membership_id: options.membership_id,
        role_id,
        organization_id: options.organization_id,
        position: index + 1,
        created_by_user_id: options.created_by_user_id,
      })),
    );
  }
}
