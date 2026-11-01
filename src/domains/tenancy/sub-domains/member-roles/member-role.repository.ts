import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import {
  type CursorTimestampRow,
  cursorTimestampSelection,
} from '@/shared/utils/http/pagination.util.js';
import { getTableColumns, and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { databaseNowTimestamp } from '@/shared/utils/infrastructure/database-timestamp.util.js';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import {
  membership_additional_roles,
  membershipHoldsRole,
} from '@/domains/tenancy/sub-domains/membership/membership-additional-roles/membership-additional-roles.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { runInsertWithPublicIdentifierRetry } from '@/shared/utils/infrastructure/postgres-error.util.js';
import {
  RESOURCE_QUOTA_LOCK_NAMESPACE,
  acquireResourceQuotaLock,
} from '@/infrastructure/database/resource-quota-lock.util.js';
import {
  buildSearchCondition,
  finishKeysetPage,
  resolveKeysetSort,
} from '@/shared/utils/http/list-query.util.js';
import type { MemberRoleRow } from './member-role.types.js';

interface MemberRoleListPagination {
  after?: string;
  limit: number;
  q?: string;
  sort?: 'name' | 'created_at';
  order?: 'asc' | 'desc';
}

/**
 * Membership lifecycle statuses that count toward a role's `member_count`.
 *
 * ACTIVE + INVITED mirrors the organization seat count
 * ({@link MembershipRepository.countActiveByOrganization}) and the set the
 * members list surfaces per role, so the Roles panel's per-role count reconciles
 * with the Members list. SUSPENDED memberships are a per-organization ban and are
 * excluded (a suspended seat is not in use). This constant is the single lever
 * for the counted-status policy — change it here to change every `member_count`.
 */
const MEMBER_COUNT_STATUSES = [MEMBERSHIP_STATUS.ACTIVE, MEMBERSHIP_STATUS.INVITED] as const;

/**
 * Drizzle data access for `tenancy.roles`. Active rows are filtered via
 * `deleted_at IS NULL` (soft-delete semantics); listing uses a `(name, id)`
 * keyset cursor for stable alphabetical paging. Public ids are generated and
 * retried on collision via {@link runInsertWithPublicIdentifierRetry}.
 */
export class MemberRoleRepository {
  /**
   * Counts the active (not soft-deleted) custom roles for the given organization.
   *
   * @remarks
   * sec-r5-followup-ratelimit-dos-2: used by `MemberRoleService.create` to
   * enforce `MEMBER_ROLE_MAX_PER_ORG`. Same shape as
   * `webhook.repository.countActiveByOrganization`.
   */
  async countActiveByOrganization(organization_id: number): Promise<number> {
    const rows = await getRequestDatabase()
      .select({ value: sql<number>`count(*)::int` })
      .from(roles)
      .where(and(eq(roles.organization_id, organization_id), isNull(roles.deleted_at)));
    return rows[0]?.value ?? 0;
  }

  /**
   * audit-#8: transaction-scoped advisory lock serializing the per-organization custom-role creation quota
   * check + insert so concurrent creates cannot both pass the count and overshoot
   * `MEMBER_ROLE_MAX_PER_ORG`. Call inside the create transaction before
   * {@link countActiveByOrganization}.
   */
  async acquireCreationQuotaLock(organization_id: number): Promise<void> {
    await acquireResourceQuotaLock({
      namespace: RESOURCE_QUOTA_LOCK_NAMESPACE.MEMBER_ROLE,
      key: organization_id,
    });
  }

  async findByOrganizationId(organization_id: number, pagination: MemberRoleListPagination) {
    const { after, limit, q, sort, order } = pagination;
    const { orderBy, cursorCondition, sortValueFor, filterFingerprint } =
      resolveKeysetSort<MemberRoleRow>({
        columns: {
          name: { column: roles.name, kind: 'text', getSortValue: (role) => role.name },
          created_at: { column: roles.created_at, kind: 'created_at' },
        },
        idColumn: roles.id,
        defaultSort: 'name',
        sort,
        order,
        q,
        after,
      });
    const where = and(
      eq(roles.organization_id, organization_id),
      isNull(roles.deleted_at),
      buildSearchCondition({ columns: [roles.name], q }),
      cursorCondition,
    );
    const rows = (await getRequestDatabase()
      .select({
        ...getTableColumns(roles),
        cursor_created_at: cursorTimestampSelection(roles.created_at),
      })
      .from(roles)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit + 1)) as (MemberRoleRow & CursorTimestampRow)[];
    return finishKeysetPage({ rows, args: { limit, sortValueFor, filterFingerprint } });
  }

  /**
   * Counts the members assigned to each role in an organization, in ONE aggregate.
   *
   * @remarks
   * - **Algorithm:** a single `GROUP BY role_id` over `memberships`, filtered to
   *   {@link MEMBER_COUNT_STATUSES} (ACTIVE + INVITED) and `deleted_at IS NULL`.
   *   Returns a `Map` keyed by internal `role_id`; roles with no counted members
   *   are simply absent, so callers default to 0. One grouped scan bounded by the
   *   per-organization member cap — this is what keeps the roles-list `member_count`
   *   projection free of an N+1 (never call {@link countMembersForRole} per row).
   * - **Failure modes:** none beyond the underlying query; runs under the organization RLS
   *   context (`memberships` is organization-scoped), so the organization predicate is belt-and-suspenders.
   * - **Side effects:** none (read-only).
   */
  async countMembersByRoleForOrganization(organization_id: number): Promise<Map<number, number>> {
    const rows = await getRequestDatabase()
      .select({ role_id: memberships.role_id, member_count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(
        and(
          eq(memberships.organization_id, organization_id),
          inArray(memberships.status, [...MEMBER_COUNT_STATUSES]),
          isNull(memberships.deleted_at),
        ),
      )
      .groupBy(memberships.role_id);
    const counts = new Map(rows.map((row) => [row.role_id, row.member_count]));
    // Plus the people holding the role as an additional one (D5). A person holds a role once —
    // main or additional — so the two counts add up without double counting.
    const additionalRows = await getRequestDatabase()
      .select({
        role_id: membership_additional_roles.role_id,
        member_count: sql<number>`count(*)::int`,
      })
      .from(membership_additional_roles)
      .innerJoin(memberships, eq(memberships.id, membership_additional_roles.membership_id))
      .where(
        and(
          eq(memberships.organization_id, organization_id),
          inArray(memberships.status, [...MEMBER_COUNT_STATUSES]),
          isNull(memberships.deleted_at),
        ),
      )
      .groupBy(membership_additional_roles.role_id);
    for (const row of additionalRows) {
      counts.set(row.role_id, (counts.get(row.role_id) ?? 0) + row.member_count);
    }
    return counts;
  }

  /**
   * Counts the members assigned to a single role in an organization.
   *
   * @remarks
   * Same status filter as {@link countMembersByRoleForOrganization} (ACTIVE +
   * INVITED, not soft-deleted) — used by the single-role get / update paths where
   * grouping the whole organization would be wasteful. Distinct from
   * {@link MembershipRepository.countActiveByRoleId}, which counts EVERY
   * non-deleted membership (including SUSPENDED) for the delete guard's
   * "any member blocks delete" semantics.
   */
  async countMembersForRole(role_id: number, organization_id: number): Promise<number> {
    const rows = await getRequestDatabase()
      .select({ member_count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(
        and(
          membershipHoldsRole(role_id),
          eq(memberships.organization_id, organization_id),
          inArray(memberships.status, [...MEMBER_COUNT_STATUSES]),
          isNull(memberships.deleted_at),
        ),
      );
    return rows[0]?.member_count ?? 0;
  }

  async findByPublicId(public_id: string, organization_id: number): Promise<MemberRoleRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.public_id, public_id),
          eq(roles.organization_id, organization_id),
          isNull(roles.deleted_at),
        ),
      )
      .limit(1);
    return (rows[0] ?? null) as MemberRoleRow | null;
  }

  /**
   * The organization's live system role with this name (`Owner`, `Admin`, the clinic roles), or
   * null — system role names are fixed, so the name identifies the role.
   */
  async findSystemRoleByName(name: string, organization_id: number): Promise<MemberRoleRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.name, name),
          eq(roles.organization_id, organization_id),
          eq(roles.is_system, true),
          isNull(roles.deleted_at),
        ),
      )
      .limit(1);
    return (rows[0] ?? null) as MemberRoleRow | null;
  }

  async findByInternalId(
    role_internal_id: number,
    organization_id: number,
  ): Promise<MemberRoleRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.id, role_internal_id),
          eq(roles.organization_id, organization_id),
          isNull(roles.deleted_at),
        ),
      )
      .limit(1);
    return (rows[0] ?? null) as MemberRoleRow | null;
  }

  async create(data: {
    organization_id: number;
    name: string;
    description?: string | null;
    is_system?: boolean;
    tone?: string;
    created_by_user_id?: number | null;
  }) {
    return runInsertWithPublicIdentifierRetry({
      insert: async () => {
        const public_id = generatePublicId('memberRole');
        const row = {
          public_id,
          organization_id: data.organization_id,
          name: data.name,
          description: data.description ?? null,
          is_system: data.is_system ?? false,
          ...(data.tone === undefined ? {} : { tone: data.tone }),
          created_by_user_id: data.created_by_user_id ?? undefined,
          updated_by_user_id: data.created_by_user_id ?? undefined,
        };
        const rows = await getRequestDatabase().insert(roles).values(row).returning();
        return rows[0]! as MemberRoleRow;
      },
    });
  }

  async update(
    public_id: string,
    organization_id: number,
    data: { name?: string; description?: string | null; tone?: string },
    updated_by_user_id: number | null,
  ): Promise<MemberRoleRow | null> {
    const rows = await getRequestDatabase()
      .update(roles)
      .set({
        ...data,
        updated_at: databaseNowTimestamp,
        updated_by_user_id: updated_by_user_id ?? undefined,
      })
      .where(
        and(
          eq(roles.public_id, public_id),
          eq(roles.organization_id, organization_id),
          isNull(roles.deleted_at),
        ),
      )
      .returning();
    return (rows[0] ?? null) as MemberRoleRow | null;
  }

  /**
   * Soft-deletes a role, with why (T12), ONLY if no live member holds it (any status), in ONE
   * statement.
   *
   * @remarks
   * A `NOT EXISTS` over `memberships` is folded into the delete's WHERE so a concurrent
   * member-assignment cannot slip between a separate count and the delete and leave a member pointing
   * at a `deleted_at` role — which the permission-resolution join (`roles.deleted_at IS NULL`) would
   * then silently strip of all permissions (route-audit C2). Returns the deleted row, or `null` when
   * the role is missing/already-deleted OR still has active members; the caller distinguishes the
   * latter via a prior existence check.
   */
  async softDeleteIfNoActiveMembers(
    public_id: string,
    organization_id: number,
    removal: {
      delete_reason: string;
      delete_note: string | null;
      updated_by_user_id: number | null;
    },
  ): Promise<MemberRoleRow | null> {
    const rows = await getRequestDatabase()
      .update(roles)
      .set({
        deleted_at: databaseNowTimestamp,
        updated_at: databaseNowTimestamp,
        delete_reason: removal.delete_reason,
        delete_note: removal.delete_note,
        ...(removal.updated_by_user_id === null
          ? {}
          : { updated_by_user_id: removal.updated_by_user_id }),
      })
      .where(
        and(
          eq(roles.public_id, public_id),
          eq(roles.organization_id, organization_id),
          isNull(roles.deleted_at),
          sql`NOT EXISTS (
            SELECT 1
            FROM ${memberships}
            WHERE ${membershipHoldsRole(roles.id)}
              AND ${memberships.organization_id} = ${organization_id}
              AND ${memberships.deleted_at} IS NULL
          )`,
        ),
      )
      .returning();
    return (rows[0] ?? null) as MemberRoleRow | null;
  }

  /** A deleted role of the organization by public id (the restore path, launch T12), or null. */
  async findDeletedByPublicId(
    public_id: string,
    organization_id: number,
  ): Promise<MemberRoleRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.public_id, public_id),
          eq(roles.organization_id, organization_id),
          isNotNull(roles.deleted_at),
        ),
      )
      .limit(1);
    return (rows[0] ?? null) as MemberRoleRow | null;
  }

  /**
   * Undoes a role's delete (launch T12): clears `deleted_at`, the reason and the note. Throws a
   * Postgres unique violation when a live role took the name meanwhile — the caller maps it to a 409.
   */
  async restore(
    public_id: string,
    organization_id: number,
    updated_by_user_id: number | null,
  ): Promise<MemberRoleRow | null> {
    const rows = await getRequestDatabase()
      .update(roles)
      .set({
        deleted_at: null,
        delete_reason: null,
        delete_note: null,
        updated_at: databaseNowTimestamp,
        ...(updated_by_user_id === null ? {} : { updated_by_user_id }),
      })
      .where(
        and(
          eq(roles.public_id, public_id),
          eq(roles.organization_id, organization_id),
          isNotNull(roles.deleted_at),
        ),
      )
      .returning();
    return (rows[0] ?? null) as MemberRoleRow | null;
  }
}
