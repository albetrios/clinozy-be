import { MEMBERSHIP_STATUS } from './membership.constants.js';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { databaseNowTimestamp } from '@/shared/utils/infrastructure/database-timestamp.util.js';
import {
  getContextFreeDatabase,
  getRequestDatabase,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { membershipHoldsRole } from '@/domains/tenancy/sub-domains/membership/membership-additional-roles/membership-additional-roles.schema.js';
import { membership_invitations } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { role_permissions } from '@/domains/tenancy/sub-domains/member-roles/member-role-permission/member-role-permission.schema.js';
import { BaseRepository } from '@/infrastructure/database/base-repository.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { runInsertWithPublicIdentifierRetry } from '@/shared/utils/infrastructure/postgres-error.util.js';
import {
  type MembershipProfileData,
  type MembershipRow,
  SEAT_CONSUMING_MEMBERSHIP_STATUSES,
} from './membership.types.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { countWithCap } from '@/infrastructure/database/utils/capped-count.util.js';
import {
  buildContainsLikePattern,
  finishKeysetPage,
  resolveKeysetSort,
} from '@/shared/utils/http/list-query.util.js';

/**
 * SQL condition: one of the membership's live roles — main or extra (D5) — grants `permissionCode`:
 * the directory's `holds` filter (T8), the rule the task assignee check applies to one member.
 */
function membershipHoldsPermission(permissionCode: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${roles}
    JOIN ${role_permissions} ON ${role_permissions.role_id} = ${roles.id}
    WHERE ${membershipHoldsRole(roles.id)}
      AND ${roles.deleted_at} IS NULL
      AND ${role_permissions.permission_code} = ${permissionCode}
  )`;
}

/** What {@link MembershipRepository.list} reads: paging, sort, search and the filters. */
export interface MembershipListQuery {
  after?: string | undefined;
  limit: number;
  /** The member's name (`display_name`) or login email. */
  q?: string | undefined;
  /** `created_at` (default) or `name` — the membership's `display_name`. */
  sort?: 'name' | 'created_at' | undefined;
  order?: 'asc' | 'desc' | undefined;
  /** Only these statuses; every status when absent. */
  statuses?: readonly string[] | undefined;
  /** Only members holding this role (internal id), main or extra. */
  roleId?: number | undefined;
  /** Only members one of whose live roles grants this permission code (T8 — the `holds` filter). */
  holdsPermissionCode?: string | undefined;
  /** Only these memberships (internal ids) — e.g. the members of one branch. */
  membershipIds?: readonly number[] | undefined;
  /** Only these memberships (public ids). */
  publicIds?: readonly string[] | undefined;
  /** Ended (soft-deleted) memberships too (launch K5, D58). */
  includeEnded?: boolean | undefined;
  /** Count the (capped) total on the first page. */
  withTotal?: boolean | undefined;
}

/** One page of {@link MembershipRepository.list}. */
export interface MembershipPage {
  items: MembershipRow[];
  /** The capped total on the first page when asked; `null` otherwise. */
  total: number | null;
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
}

/** Row shape returned by {@link MembershipRepository.listOrganizationsForUserDataExport}. */
export interface MembershipOrganizationUserDataExportRow {
  name: string;
  slug: string | null;
  status: string;
  created_at: Date;
}

/**
 * Raw user summary from {@link MembershipRepository.resolveUserSummariesByInternalIds}. `avatar_url`
 * is the RAW stored object key (or absolute provider URL) — the service presigns it before serializing.
 */
export interface MembershipUserSummaryRow {
  public_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

/** Raw role summary from {@link MembershipRepository.resolveRoleSummariesByInternalIds}. */
export interface MembershipRoleSummaryRow {
  public_id: string;
  name: string;
  tone: string;
  is_system: boolean;
}

/** Raw live-invitation reference from {@link MembershipRepository.resolveLiveInvitationsByMembershipIds}. */
export interface MembershipInvitationRefRow {
  public_id: string;
  expires_at: Date;
}

/**
 * Drizzle data access for `tenancy.memberships`. Active rows are filtered via
 * `deleted_at IS NULL` (soft-delete semantics) and a partial unique index
 * keeps the `(user_id, organization_id)` pair unique among active rows.
 * Listing uses a `(created_at, id)` or `(display_name, id)` keyset cursor; `joined_at` is set once,
 * when the invite is accepted (launch T10).
 */
export class MembershipRepository extends BaseRepository {
  /**
   * A login's live memberships with their organization's public id (account deletion, K6). Runs
   * under the login's own user context — the same cross-organization read as the data export.
   */
  async listLiveForUser(user_id: number): Promise<
    {
      id: number;
      public_id: string;
      organization_id: number;
      organization_public_id: string;
    }[]
  > {
    return getRequestDatabase()
      .select({
        id: memberships.id,
        public_id: memberships.public_id,
        organization_id: memberships.organization_id,
        organization_public_id: organizations.public_id,
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organization_id, organizations.id))
      .where(and(eq(memberships.user_id, user_id), isNull(memberships.deleted_at)))
      .orderBy(memberships.id);
  }

  async listOrganizationsForUserDataExport(
    user_id: number,
    limit: number,
  ): Promise<MembershipOrganizationUserDataExportRow[]> {
    return getRequestDatabase()
      .select({
        name: organizations.name,
        slug: organizations.slug,
        status: memberships.status,
        created_at: memberships.created_at,
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organization_id, organizations.id))
      .where(
        and(
          eq(memberships.user_id, user_id),
          isNull(memberships.deleted_at),
          isNull(organizations.deleted_at),
        ),
      )
      .limit(limit);
  }

  /**
   * One page of an organization's memberships (launch §2.A / §2.B): the team list and the team
   * picker both read here.
   *
   * @remarks
   * - **Algorithm:** one keyset query over `tenancy.memberships` — `created_at` (default) or `name`
   *   (the membership's own `display_name`, K3) with the `id` tie-break; the filters are columns
   *   (`status`, `public_id`, `id`), the role (main or extra, {@link membershipHoldsRole}), a
   *   permission code one of the roles grants (`holds`, T8) and `q`
   *   (ids from the SECURITY DEFINER search, which reads the login's email). Every filter is in the
   *   cursor fingerprint, so a cursor never crosses to another filter set. The capped total runs on
   *   the first page only when asked.
   * - **Failure modes:** none beyond the query; an empty id filter is an empty page.
   */
  async list(organization_id: number, query: MembershipListQuery): Promise<MembershipPage> {
    const emptyPage: MembershipPage = {
      items: [],
      total: query.withTotal ? 0 : null,
      limit: query.limit,
      has_more: false,
      next_cursor: null,
    };
    let searchIds: readonly number[] | undefined;
    if (query.q !== undefined) {
      searchIds = await this.searchMembershipIds(organization_id, query.q);
      if (searchIds.length === 0) return emptyPage;
    }
    if (query.membershipIds?.length === 0 || query.publicIds?.length === 0) return emptyPage;
    const where = and(
      eq(memberships.organization_id, organization_id),
      query.includeEnded ? undefined : isNull(memberships.deleted_at),
      query.statuses === undefined ? undefined : inArray(memberships.status, [...query.statuses]),
      query.roleId === undefined ? undefined : membershipHoldsRole(query.roleId),
      query.holdsPermissionCode === undefined
        ? undefined
        : membershipHoldsPermission(query.holdsPermissionCode),
      query.membershipIds === undefined
        ? undefined
        : inArray(memberships.id, [...query.membershipIds]),
      query.publicIds === undefined
        ? undefined
        : inArray(memberships.public_id, [...query.publicIds]),
      searchIds === undefined ? undefined : inArray(memberships.id, [...searchIds]),
    );
    const { orderBy, cursorCondition, sortValueFor, filterFingerprint } =
      resolveKeysetSort<MembershipRow>({
        columns: {
          created_at: { column: memberships.created_at, kind: 'created_at' },
          name: {
            column: memberships.display_name,
            kind: 'text',
            getSortValue: (row) => row.display_name,
          },
        },
        idColumn: memberships.id,
        defaultSort: 'created_at',
        sort: query.sort,
        order: query.order,
        q: query.q,
        filters: {
          statuses: query.statuses ?? null,
          role: query.roleId ?? null,
          holds: query.holdsPermissionCode ?? null,
          members: query.membershipIds ?? null,
          ids: query.publicIds ?? null,
          ended: query.includeEnded ?? false,
        },
        after: query.after,
      });
    const rows = (await getRequestDatabase()
      .select()
      .from(memberships)
      .where(and(where, cursorCondition))
      .orderBy(...orderBy)
      .limit(query.limit + 1)) as MembershipRow[];
    const page = finishKeysetPage(rows, { limit: query.limit, sortValueFor, filterFingerprint });
    const total =
      query.withTotal && query.after === undefined
        ? await countWithCap({ database: getRequestDatabase(), table: memberships, where })
        : null;
    return { ...page, total };
  }

  /**
   * Resolves the membership ids in an organization (live or ended) whose name (`display_name`) or
   * login email matches `q`. `auth.users` is FORCE RLS behind a self-owner policy, so under
   * organization-only context a plain join matches zero rows — the search goes through the
   * `tenancy.search_organization_membership_ids` SECURITY DEFINER function (20260702000000), which
   * bypasses RLS by explicit organization scoping and exposes no `auth.users` columns. The term is
   * escaped into a `%…%` `ILIKE` pattern before binding.
   */
  private async searchMembershipIds(organization_id: number, q: string): Promise<number[]> {
    const pattern = buildContainsLikePattern(q);
    const result = await getRequestDatabase().execute(
      sql`SELECT id FROM tenancy.search_organization_membership_ids(${organization_id}::bigint, ${pattern}::text)`,
    );
    const rows = (
      Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    ) as { id: number | string }[];
    return rows.map((row) => Number(row.id));
  }

  /**
   * Maps internal user ids to display SUMMARIES (public id + email + name + raw avatar key) for the
   * membership serializer's embedded `user` object. `auth.users` is FORCE RLS (self-scoped) and
   * these reads run under organization-only context, so a plain join would match zero rows under the app
   * role — delegate to the SECURITY DEFINER batch resolver (RLS bypass by ownership). Batched to
   * avoid an N+1 per list page; `avatar_url` is the RAW stored key — the service presigns it.
   */
  async resolveUserSummariesByInternalIds(
    userInternalIds: readonly number[],
  ): Promise<Map<number, MembershipUserSummaryRow>> {
    if (userInternalIds.length === 0) return new Map();
    // Build an explicit `ARRAY[...]::bigint[]` literal — drizzle can't bind a JS array as a single
    // parameter to the function's BIGINT[] argument.
    const userIdValues = sql.join(
      userInternalIds.map((userInternalId) => sql`${userInternalId}`),
      sql`, `,
    );
    const result = await getContextFreeDatabase().execute(
      sql`SELECT id, public_id, email, first_name, last_name, avatar_url FROM auth.resolve_user_summaries_by_ids(ARRAY[${userIdValues}]::bigint[])`,
    );
    const rows = (
      Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    ) as {
      id: number | string;
      public_id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    }[];
    return new Map(
      rows.map((row) => [
        Number(row.id),
        {
          public_id: row.public_id,
          email: row.email,
          first_name: row.first_name,
          last_name: row.last_name,
          avatar_url: row.avatar_url,
        },
      ]),
    );
  }

  /**
   * Maps internal role ids to summaries (public id, name, tone, system flag) — the member list's
   * `role_ids` and the caller's `my_roles` (`GET /auth/me/context`). `roles` is organization-scoped,
   * so a normal RLS-scoped query under the current organization context is correct (no resolver
   * needed).
   */
  async resolveRoleSummariesByInternalIds(
    roleInternalIds: readonly number[],
  ): Promise<Map<number, MembershipRoleSummaryRow>> {
    if (roleInternalIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        id: roles.id,
        public_id: roles.public_id,
        name: roles.name,
        tone: roles.tone,
        is_system: roles.is_system,
      })
      .from(roles)
      // audit #38: exclude soft-deleted roles so a membership referencing a deleted role does not
      // surface the deleted role's name in the member-list response (the serializer then falls
      // through to its `{ name: '' }` placeholder).
      .where(and(inArray(roles.id, [...roleInternalIds]), isNull(roles.deleted_at)));
    return new Map(
      rows.map((row) => [
        row.id,
        { public_id: row.public_id, name: row.name, tone: row.tone, is_system: row.is_system },
      ]),
    );
  }

  /**
   * Returns the internal user ids of every ACTIVE member of an organization whose (non-deleted)
   * role grants the given permission code — e.g. all `membership:create` holders, for the
   * invite-accepted notification fan-out.
   *
   * @remarks Runs under the organization RLS context (`memberships` / `roles` / `role_permissions` are all
   * organization-scoped). `selectDistinct` collapses a user who holds the permission via more than one row.
   */
  async findUserIdsWithPermission(
    organization_id: number,
    permission_code: string,
  ): Promise<number[]> {
    const rows = await getRequestDatabase()
      .selectDistinct({ user_id: memberships.user_id })
      .from(memberships)
      // Main or additional role (D5).
      .innerJoin(roles, and(membershipHoldsRole(roles.id), isNull(roles.deleted_at)))
      .innerJoin(
        role_permissions,
        and(
          eq(role_permissions.role_id, roles.id),
          eq(role_permissions.permission_code, permission_code),
        ),
      )
      .where(
        and(
          eq(memberships.organization_id, organization_id),
          eq(memberships.status, MEMBERSHIP_STATUS.ACTIVE),
          isNull(memberships.deleted_at),
        ),
      );
    return rows.map((row) => row.user_id);
  }

  /**
   * Maps internal membership ids to their live (pending — not accepted, not revoked) invitation, so
   * the serializer can embed an `invitation` ref on `INVITED` rows (the frontend drives Resend /
   * Revoke from the members table). Runs under the organization RLS context (`membership_invitations` is scoped
   * to the org's memberships) — no SECURITY DEFINER needed. Ordered ascending so the newest live
   * invite wins for a membership with more than one historical row.
   */
  async resolveLiveInvitationsByMembershipIds(
    membershipInternalIds: readonly number[],
  ): Promise<Map<number, MembershipInvitationRefRow>> {
    if (membershipInternalIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        membership_id: membership_invitations.membership_id,
        public_id: membership_invitations.public_id,
        expires_at: membership_invitations.expires_at,
      })
      .from(membership_invitations)
      .where(
        and(
          inArray(membership_invitations.membership_id, [...membershipInternalIds]),
          isNull(membership_invitations.accepted_at),
          isNull(membership_invitations.revoked_at),
        ),
      )
      .orderBy(asc(membership_invitations.created_at), asc(membership_invitations.id));
    return new Map(
      rows.map((row) => [
        row.membership_id,
        { public_id: row.public_id, expires_at: row.expires_at },
      ]),
    );
  }

  async findById(id: number): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(memberships)
      .where(and(eq(memberships.id, id), isNull(memberships.deleted_at)))
      .limit(1);
    return (rows[0] ?? null) as MembershipRow | null;
  }

  /**
   * Counts active memberships currently assigned to a role inside an organization.
   *
   * @remarks
   * Used by `MemberRoleService.delete` (sec-T3) to refuse role deletion when active
   * members would lose every permission. The count is exact (no LIMIT) because the
   * value is used in a binary decision (>0 → block), and `(role_id, organization_id)`
   * is well-indexed via the partial unique index on `(user_id, organization_id)`
   * plus the explicit `idx_memberships_role_id` if present — at worst this is a
   * sequential scan over a single org's membership rows, which is bounded by the
   * organization member cap.
   */
  async countActiveByRoleId(role_id: number, organization_id: number): Promise<number> {
    const rows = await getRequestDatabase()
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(
        and(
          membershipHoldsRole(role_id),
          eq(memberships.organization_id, organization_id),
          isNull(memberships.deleted_at),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  /**
   * Counts the seat-occupying memberships in an organization (REQ-4).
   *
   * @remarks
   * A "seat" is consumed by any membership that is either ACTIVE or still INVITED
   * (`deleted_at IS NULL`) — an outstanding invitation already reserves a seat so a
   * burst of invites cannot exceed the plan limit once everyone accepts. The count
   * is exact (no LIMIT) because it feeds a binary `used >= total` seat-availability
   * check; it is bounded by the per-organization member cap. Mirrors {@link countActiveByRoleId}.
   * SUSPENDED members are intentionally NOT counted (a suspended seat is not in use).
   */
  async countActiveByOrganization(organization_id: number): Promise<number> {
    const rows = await getRequestDatabase()
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(
        and(
          eq(memberships.organization_id, organization_id),
          inArray(memberships.status, [...SEAT_CONSUMING_MEMBERSHIP_STATUSES]),
          isNull(memberships.deleted_at),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  /**
   * F2: suspends up to `suspend_count` non-owner ACTIVE members, most-recently-joined first.
   *
   * @remarks
   * - **Algorithm:** selects the candidate ids (`ACTIVE`, not the owner, not soft-deleted) ordered
   *   by `joined_at DESC` and capped at `suspend_count`, then flips them to `SUSPENDED` in one
   *   `UPDATE … WHERE id IN (…)`. Two steps (select then update) avoid a self-referential update
   *   subquery and let the caller log exactly how many were suspended.
   * - **Failure modes:** none beyond the underlying queries; runs inside the caller's organization
   *   DB context (RLS-scoped) and transaction.
   * - **Side effects:** writes `status = 'suspended'` (a suspended seat is not counted toward the
   *   cap, so this lowers the org's seat usage). Returns the internal `user_id`s actually suspended
   *   (empty when no non-owner ACTIVE members remain — e.g. an owner-only organization that can't shrink
   *   further) so the caller can purge each suspended member's permission cache.
   */
  async suspendExcessActiveMembers(options: {
    organization_id: number;
    owner_user_id: number;
    suspend_count: number;
  }): Promise<number[]> {
    if (options.suspend_count <= 0) return [];
    const candidates = await getRequestDatabase()
      .select({ id: memberships.id, user_id: memberships.user_id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organization_id, options.organization_id),
          eq(memberships.status, MEMBERSHIP_STATUS.ACTIVE),
          ne(memberships.user_id, options.owner_user_id),
          isNull(memberships.deleted_at),
        ),
      )
      .orderBy(desc(memberships.joined_at))
      .limit(options.suspend_count);
    if (candidates.length === 0) return [];
    await getRequestDatabase()
      .update(memberships)
      .set({ status: MEMBERSHIP_STATUS.SUSPENDED, updated_at: new Date() })
      .where(
        inArray(
          memberships.id,
          candidates.map((candidate) => candidate.id),
        ),
      );
    return candidates.map((candidate) => candidate.user_id);
  }

  async findByUserAndOrganization(
    user_id: number,
    organization_id: number,
  ): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.user_id, user_id),
          eq(memberships.organization_id, organization_id),
          isNull(memberships.deleted_at),
        ),
      )
      .limit(1);
    return (rows[0] ?? null) as MembershipRow | null;
  }

  async findByPublicId(public_id: string, organization_id: number): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.public_id, public_id),
          eq(memberships.organization_id, organization_id),
          isNull(memberships.deleted_at),
        ),
      )
      .limit(1);
    return (rows[0] ?? null) as MembershipRow | null;
  }

  /**
   * Live memberships of one organization among `public_ids`, as `{ id, public_id }` pairs —
   * the lookup other domains use to turn `mem_` ids from a request into foreign keys.
   */
  async findIdsByPublicIds(
    organization_id: number,
    public_ids: readonly string[],
  ): Promise<{ id: number; public_id: string }[]> {
    if (public_ids.length === 0) return [];
    return getRequestDatabase()
      .select({ id: memberships.id, public_id: memberships.public_id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organization_id, organization_id),
          inArray(memberships.public_id, [...public_ids]),
          isNull(memberships.deleted_at),
        ),
      );
  }

  async create(data: {
    organization_id: number;
    user_id: number;
    role_id: number;
    status?: string;
    invited_by_user_id?: number | null;
    created_by_user_id?: number | null;
    profile?: MembershipProfileData;
  }) {
    return runInsertWithPublicIdentifierRetry(async () => {
      const public_id = generatePublicId('membership');
      const row = {
        ...(data.profile ?? {}),
        public_id,
        organization_id: data.organization_id,
        user_id: data.user_id,
        role_id: data.role_id,
        status: data.status ?? MEMBERSHIP_STATUS.INVITED,
        invited_by_user_id: data.invited_by_user_id ?? undefined,
        created_by_user_id: data.created_by_user_id ?? undefined,
        updated_by_user_id: data.created_by_user_id ?? undefined,
      };
      const rows = await getRequestDatabase().insert(memberships).values(row).returning();
      return rows[0]! as MembershipRow;
    });
  }

  async update(
    public_id: string,
    organization_id: number,
    data: { status?: string; role_id?: number; profile?: MembershipProfileData },
    updated_by_user_id: number | null,
  ): Promise<MembershipRow | null> {
    const payload: MembershipProfileData & {
      status?: string;
      role_id?: number;
      updated_at: Date | SQL;
      updated_by_user_id?: number;
    } = omitUndefined({
      ...data.profile,
      updated_at: databaseNowTimestamp,
      updated_by_user_id: updated_by_user_id ?? undefined,
    });
    if (data.status) payload.status = data.status;
    // T10: `joined_at` is set once, when the invite is accepted — a reactivation keeps it.
    if (data.role_id !== undefined) payload.role_id = data.role_id;
    const rows = await getRequestDatabase()
      .update(memberships)
      .set(payload)
      .where(
        and(
          eq(memberships.public_id, public_id),
          eq(memberships.organization_id, organization_id),
          isNull(memberships.deleted_at),
        ),
      )
      .returning();
    return (rows[0] ?? null) as MembershipRow | null;
  }

  /**
   * Activates a membership as part of accepting its invitation: flips the
   * status to `ACTIVE` and stamps `joined_at` only when the row is still
   * pending (`status <> 'ACTIVE'`). Scoped by internal membership id +
   * organization id so it runs inside the invitation-accept transaction
   * (shared `withAppDatabaseContext` unit of work) and stays
   * idempotent for a membership that is already active.
   */
  async activateForInvitationAccept(
    membership_id: number,
    organization_id: number,
  ): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .update(memberships)
      .set({
        status: MEMBERSHIP_STATUS.ACTIVE,
        joined_at: new Date(),
        updated_at: databaseNowTimestamp,
      })
      .where(
        and(
          eq(memberships.id, membership_id),
          eq(memberships.organization_id, organization_id),
          // route-audit-#1: ONLY a still-invited membership may be activated by accepting. Without
          // this a member an admin SUSPENDED (the per-organization ban) could self-restore to ACTIVE by
          // accepting a still-pending invitation — including one suspended while INVITED, where
          // joined_at is still NULL (so a joined_at-only guard would miss it). Mirrors the PATCH
          // guard that already blocks INVITED→ACTIVE via the manager route; permission resolution
          // keys on status='ACTIVE', so this is the access kill-switch.
          eq(memberships.status, MEMBERSHIP_STATUS.INVITED),
          isNull(memberships.deleted_at),
        ),
      )
      .returning();
    return (rows[0] ?? null) as MembershipRow | null;
  }

  async softDelete(
    public_id: string,
    organization_id: number,
    removal?: { delete_reason: string; delete_note: string | null },
  ): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .update(memberships)
      .set({
        deleted_at: databaseNowTimestamp,
        updated_at: databaseNowTimestamp,
        ...(removal ?? {}),
      })
      .where(
        and(
          eq(memberships.public_id, public_id),
          eq(memberships.organization_id, organization_id),
          isNull(memberships.deleted_at),
          // Never soft-delete the current owner's membership — neither via the member's own "leave"
          // (which could race a concurrent transfer-to-them after its owner pre-check) nor via an
          // admin removing a member. The owner must transfer ownership first; otherwise the row is
          // left intact and the caller surfaces a clean Forbidden, so the organization is never orphaned.
          sql`NOT EXISTS (
            SELECT 1 FROM ${organizations}
            WHERE ${organizations.id} = ${memberships.organization_id}
              AND ${organizations.owner_user_id} = ${memberships.user_id}
          )`,
        ),
      )
      .returning();
    return (rows[0] ?? null) as MembershipRow | null;
  }

  /** A soft-deleted membership of the organization by public id (the restore path), or null. */
  async findDeletedByPublicId(
    public_id: string,
    organization_id: number,
  ): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.public_id, public_id),
          eq(memberships.organization_id, organization_id),
          isNotNull(memberships.deleted_at),
        ),
      )
      .limit(1);
    return (rows[0] ?? null) as MembershipRow | null;
  }

  /** A membership of the organization by public id, live or ended (launch D58), or null. */
  async findAnyByPublicId(
    public_id: string,
    organization_id: number,
  ): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.public_id, public_id), eq(memberships.organization_id, organization_id)),
      )
      .limit(1);
    return (rows[0] ?? null) as MembershipRow | null;
  }

  /**
   * Renames an ended membership — the one change it accepts (launch K6, D58). A live one is never
   * renamed here: its name follows the profile (K3).
   */
  async renameEnded(options: {
    publicId: string;
    organizationId: number;
    displayName: string;
    updatedByUserId: number | null;
  }): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .update(memberships)
      .set({
        display_name: options.displayName,
        updated_at: databaseNowTimestamp,
        ...(options.updatedByUserId === null
          ? {}
          : { updated_by_user_id: options.updatedByUserId }),
      })
      .where(
        and(
          eq(memberships.public_id, options.publicId),
          eq(memberships.organization_id, options.organizationId),
          isNotNull(memberships.deleted_at),
        ),
      )
      .returning();
    return (rows[0] ?? null) as MembershipRow | null;
  }

  /** The login's most recently ended membership in the organization (launch K7), or null. */
  async findLatestEndedForUser(options: {
    userId: number;
    organizationId: number;
  }): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.user_id, options.userId),
          eq(memberships.organization_id, options.organizationId),
          isNotNull(memberships.deleted_at),
        ),
      )
      .orderBy(desc(memberships.deleted_at), desc(memberships.id))
      .limit(1);
    return (rows[0] ?? null) as MembershipRow | null;
  }

  /**
   * Brings an ended membership back as invited (launch K7 — the same login added again): same id,
   * staff number and history; the new main role and profile; `joined_at` cleared until the invite
   * is accepted. The display name follows the profile again (`trg_memberships_display_name`).
   * Throws a Postgres unique violation when the login holds a live membership already.
   */
  async reviveAsInvited(options: {
    id: number;
    organizationId: number;
    roleId: number;
    invitedByUserId: number;
    profile: MembershipProfileData;
  }): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .update(memberships)
      .set({
        ...options.profile,
        role_id: options.roleId,
        status: MEMBERSHIP_STATUS.INVITED,
        joined_at: null,
        invited_by_user_id: options.invitedByUserId,
        deleted_at: null,
        delete_reason: null,
        delete_note: null,
        updated_at: databaseNowTimestamp,
        updated_by_user_id: options.invitedByUserId,
      })
      .where(
        and(
          eq(memberships.id, options.id),
          eq(memberships.organization_id, options.organizationId),
          isNotNull(memberships.deleted_at),
        ),
      )
      .returning();
    return (rows[0] ?? null) as MembershipRow | null;
  }

  /**
   * Undoes a soft delete: clears `deleted_at` and the removal reason and note. Throws a Postgres
   * unique violation when the person already holds a live membership again
   * (`idx_memberships_user_org_unique`) — the caller maps it to a 409.
   */
  async restore(
    public_id: string,
    organization_id: number,
    updated_by_user_id: number | null,
  ): Promise<MembershipRow | null> {
    const rows = await getRequestDatabase()
      .update(memberships)
      .set({
        deleted_at: null,
        delete_reason: null,
        delete_note: null,
        updated_at: databaseNowTimestamp,
        ...(updated_by_user_id === null ? {} : { updated_by_user_id }),
      })
      .where(
        and(
          eq(memberships.public_id, public_id),
          eq(memberships.organization_id, organization_id),
          isNotNull(memberships.deleted_at),
        ),
      )
      .returning();
    return (rows[0] ?? null) as MembershipRow | null;
  }
}
