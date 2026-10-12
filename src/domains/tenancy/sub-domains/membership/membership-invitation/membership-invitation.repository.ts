import { and, asc, count, desc, eq, gt, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { finishKeysetPage } from '@/shared/utils/http/list-query.util.js';
import {
  assertWorkerDatabaseContext,
  getContextFreeDatabase,
  getRequestDatabase,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import { membership_invitations } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { runInsertWithPublicIdentifierRetry } from '@/shared/utils/infrastructure/postgres-error.util.js';
import {
  acquireResourceQuotaLock,
  RESOURCE_QUOTA_LOCK_NAMESPACE,
} from '@/infrastructure/database/resource-quota-lock.util.js';
import type {
  MembershipInvitationRow,
  PendingInvitationForEmailRow,
} from './membership-invitation.types.js';
import {
  buildAscendingCreatedAtIdCursorCondition,
  createOpaqueCursorFromRow,
  cursorTimestampSelection,
  parseListCursor,
} from '@/shared/utils/http/pagination.util.js';

/**
 * Cross-organization lookup result returned by the SECURITY DEFINER
 * `tenancy.resolve_membership_invitation_lookup_by_public_id` function. Used by
 * `MembershipInvitationService.accept` so the caller can resolve the owning
 * organization without RLS context, then wrap the actual UPDATE in
 * `withAppDatabaseContext`.
 */
export interface MembershipInvitationOrganizationLookupRow {
  organization_public_id: string;
  organization_id: number;
  membership_public_id: string;
  membership_id: number;
}

type MembershipInvitationOrganizationLookupDatabaseRow = {
  organization_public_id: string;
  organization_id: string | number;
  membership_public_id: string;
  membership_id: string | number;
};

/**
 * Cursor-pagination options for {@link MembershipInvitationRepository.findByOrganizationId}.
 * Setting `include_total` to `true` opts in to a parallel `COUNT(*)` query for
 * pagination summaries.
 */
export interface MembershipInvitationListPagination {
  after?: string;
  limit: number;
  include_total?: boolean;
}

/**
 * Drizzle data access for `tenancy.membership_invitations`. Org-scoped reads
 * (listing, find-by-public-id, accept/revoke/resend updates) run under the
 * caller's RLS context; cross-organization lookups by email or by invitation public id
 * use SECURITY DEFINER SQL functions so the public accept flow can
 * resolve the owning organization without an organization GUC set up front.
 */
export class MembershipInvitationRepository {
  async findByOrganizationId(
    organization_id: number,
    pagination: MembershipInvitationListPagination,
  ) {
    const { after, limit } = pagination;
    const includeTotal = pagination.include_total === true;
    const filterConditions: SQL[] = [
      eq(memberships.organization_id, organization_id),
      isNull(memberships.deleted_at),
    ];
    const countWhere = and(...filterConditions);
    const cursorCondition = buildAscendingCreatedAtIdCursorCondition({
      createdAtColumn: membership_invitations.created_at,
      idColumn: membership_invitations.id,
      cursor: parseListCursor(after),
    });
    const where =
      cursorCondition !== undefined ? and(...filterConditions, cursorCondition) : countWhere;

    const rowsPromise = getRequestDatabase()
      .select({
        invitation: membership_invitations,
        cursor_created_at: cursorTimestampSelection(membership_invitations.created_at),
        membership_public_id: memberships.public_id,
      })
      .from(membership_invitations)
      .innerJoin(memberships, eq(membership_invitations.membership_id, memberships.id))
      .where(where)
      .orderBy(asc(membership_invitations.created_at), asc(membership_invitations.id))
      .limit(limit + 1);

    const countPromise = includeTotal
      ? getRequestDatabase()
          .select({ count: count() })
          .from(membership_invitations)
          .innerJoin(memberships, eq(membership_invitations.membership_id, memberships.id))
          .where(countWhere)
          .then((rows) => rows[0]?.count ?? 0)
      : Promise.resolve(null);

    const [fetchedRows, total] = await Promise.all([rowsPromise, countPromise]);
    const rows = fetchedRows.map((row) => ({
      ...row.invitation,
      cursor_created_at: row.cursor_created_at,
      membership_public_id: row.membership_public_id,
    }));
    return finishKeysetPage({ rows, args: { limit, total } });
  }

  async findByPublicId(public_id: string): Promise<MembershipInvitationRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(membership_invitations)
      .where(eq(membership_invitations.public_id, public_id))
      .limit(1);
    return (rows[0] ?? null) as MembershipInvitationRow | null;
  }

  /** A membership's most recent invitation (the one revoke and resend act on, launch T9), or null. */
  async findLatestByMembershipId(membership_id: number): Promise<MembershipInvitationRow | null> {
    const rows = await getRequestDatabase()
      .select()
      .from(membership_invitations)
      .where(eq(membership_invitations.membership_id, membership_id))
      .orderBy(desc(membership_invitations.created_at), desc(membership_invitations.id))
      .limit(1);
    return (rows[0] ?? null) as MembershipInvitationRow | null;
  }

  /**
   * Count an organization's live pending invitations — not accepted, not revoked, and not yet
   * expired. Joins through `memberships` because `membership_invitations` carries no `organization_id`
   * column. Backs the service-layer per-organization cap so a single tenant cannot enqueue an
   * unbounded backlog of outstanding invites (each of which also sends an email).
   */
  async countPendingByOrganization(organization_id: number): Promise<number> {
    const rows = await getRequestDatabase()
      .select({ value: count() })
      .from(membership_invitations)
      .innerJoin(memberships, eq(membership_invitations.membership_id, memberships.id))
      .where(
        and(
          eq(memberships.organization_id, organization_id),
          isNull(membership_invitations.accepted_at),
          isNull(membership_invitations.revoked_at),
          gt(membership_invitations.expires_at, new Date()),
          isNull(memberships.deleted_at),
        ),
      );
    return Number(rows[0]?.value ?? 0);
  }

  /**
   * audit-#8: transaction-scoped advisory lock serializing the per-organization pending-invitation quota
   * check + insert so concurrent invites cannot both pass the same count and overshoot
   * `INVITATION_MAX_PENDING_PER_ORG`. Call inside the create transaction before
   * {@link MembershipInvitationRepository.countPendingByOrganization}.
   */
  async acquireCreationQuotaLock(organization_id: number): Promise<void> {
    await acquireResourceQuotaLock({
      namespace: RESOURCE_QUOTA_LOCK_NAMESPACE.MEMBERSHIP_INVITATION,
      key: organization_id,
    });
  }

  /**
   * Cross-organization lookup of an invitation's owning organization by public id.
   *
   * Bypasses tenant RLS via the SECURITY DEFINER function
   * `tenancy.resolve_membership_invitation_lookup_by_public_id` so the public accept
   * route and the user-driven decline route can resolve the organization without
   * having `app.current_organization_public_id` set up front.
   */
  async lookupOrganizationByInvitationPublicId(
    invitation_public_id: string,
  ): Promise<MembershipInvitationOrganizationLookupRow | null> {
    const result =
      await getContextFreeDatabase().execute<MembershipInvitationOrganizationLookupDatabaseRow>(
        sql`SELECT organization_public_id, organization_id, membership_public_id, membership_id FROM tenancy.resolve_membership_invitation_lookup_by_public_id(${invitation_public_id})`,
      );
    const rows = (
      Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    ) as MembershipInvitationOrganizationLookupDatabaseRow[];
    const row = rows[0];
    if (!row) return null;
    return {
      organization_public_id: row.organization_public_id,
      organization_id: Number(row.organization_id),
      membership_public_id: row.membership_public_id,
      membership_id: Number(row.membership_id),
    };
  }

  /**
   * One email's pending invitations across organizations (launch D84 (1)) — not accepted, not
   * revoked, not expired, the invited membership and its organization live — oldest first, each
   * with the organization, the role names and the inviter.
   *
   * @remarks
   * - **Algorithm:** the SECURITY DEFINER read
   *   `tenancy.list_pending_membership_invitations_for_email` (the invitee is not a member of the
   *   inviting organization, whose row-level security hides every row), keyset-paged on
   *   `(created_at, id)`: one row past `limit` says whether there is more.
   * - **Notes:** the caller passes a verified email only — the function trusts its argument — and
   *   runs it in the invitee's own user context.
   */
  async listPendingForEmail(
    email: string,
    pagination: { after?: string; limit: number },
  ): Promise<{
    items: PendingInvitationForEmailRow[];
    limit: number;
    has_more: boolean;
    next_cursor: string | null;
  }> {
    const cursor = parseListCursor(pagination.after);
    // The cursor's exact microsecond text, cast back to a timestamp in the query.
    const afterCreatedAt = cursor?.id === undefined ? null : cursor.created_at;
    const afterId = cursor?.id ?? null;
    const result = await getRequestDatabase().execute<{
      invitation_id: string | number;
      invitation_public_id: string;
      organization_public_id: string;
      organization_name: string;
      organization_slug: string | null;
      organization_logo_url: string | null;
      membership_public_id: string;
      role_names: string[] | null;
      inviter_name: string | null;
      invitation_expires_at: Date | string;
      invitation_created_at: Date | string;
      cursor_created_at: string;
    }>(sql`
      SELECT
        invitation_id,
        invitation_public_id,
        organization_public_id,
        organization_name,
        organization_slug,
        organization_logo_url,
        membership_public_id,
        role_names,
        inviter_name,
        invitation_expires_at,
        invitation_created_at,
        to_char(invitation_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      FROM tenancy.list_pending_membership_invitations_for_email(
        ${email},
        ${pagination.limit + 1},
        ${afterCreatedAt}::timestamptz,
        ${afterId}::bigint
      )
    `);
    const rows = result.rows;
    const hasMore = rows.length > pagination.limit;
    const items = (hasMore ? rows.slice(0, pagination.limit) : rows).map((row) => ({
      invitation_id: Number(row.invitation_id),
      invitation_public_id: row.invitation_public_id,
      organization_public_id: row.organization_public_id,
      organization_name: row.organization_name,
      organization_slug: row.organization_slug,
      organization_logo_url: row.organization_logo_url,
      membership_public_id: row.membership_public_id,
      role_names: row.role_names ?? [],
      inviter_name: row.inviter_name,
      expires_at: new Date(row.invitation_expires_at),
      created_at: new Date(row.invitation_created_at),
    }));
    const lastRow = hasMore ? rows[pagination.limit - 1] : undefined;
    return {
      items,
      limit: pagination.limit,
      has_more: hasMore,
      next_cursor:
        lastRow !== undefined
          ? createOpaqueCursorFromRow({
              cursor_created_at: lastRow.cursor_created_at,
              id: Number(lastRow.invitation_id),
            })
          : null,
    };
  }

  async create(data: {
    membership_id: number;
    email: string;
    token_hash: string;
    invited_by_user_id: number;
    expires_at: Date;
    created_by_user_id?: number | null;
  }) {
    return runInsertWithPublicIdentifierRetry({
      insert: async () => {
        const public_id = generatePublicId('membershipInvitation');
        const rows = await getRequestDatabase()
          .insert(membership_invitations)
          .values({
            public_id,
            membership_id: data.membership_id,
            email: data.email,
            token_hash: data.token_hash,
            invited_by_user_id: data.invited_by_user_id,
            expires_at: data.expires_at,
            ...(data.created_by_user_id !== undefined &&
              data.created_by_user_id !== null && {
                created_by_user_id: data.created_by_user_id,
              }),
          })
          .returning();
        return rows[0]! as MembershipInvitationRow;
      },
    });
  }

  /**
   * Marks a pending invitation accepted — one-shot: it must still be unaccepted, unrevoked and
   * unexpired. With a `token_hash` the emailed token must match too; `null` is the in-app accept
   * of the verified, matching email (launch D84 (2)), which the service checked first.
   */
  async accept(
    public_id: string,
    token_hash: string | null,
    expires_after: Date,
  ): Promise<MembershipInvitationRow | null> {
    const rows = await getRequestDatabase()
      .update(membership_invitations)
      .set({ accepted_at: new Date() })
      .where(
        and(
          eq(membership_invitations.public_id, public_id),
          token_hash === null ? undefined : eq(membership_invitations.token_hash, token_hash),
          gt(membership_invitations.expires_at, expires_after),
          isNull(membership_invitations.accepted_at),
          isNull(membership_invitations.revoked_at),
        ),
      )
      .returning();
    return (rows[0] ?? null) as MembershipInvitationRow | null;
  }

  async resend(
    public_id: string,
    token_hash: string,
    expires_at: Date,
  ): Promise<MembershipInvitationRow | null> {
    const rows = await getRequestDatabase()
      .update(membership_invitations)
      .set({ token_hash, expires_at })
      .where(
        and(
          eq(membership_invitations.public_id, public_id),
          isNull(membership_invitations.accepted_at),
          isNull(membership_invitations.revoked_at),
        ),
      )
      .returning();
    return (rows[0] ?? null) as MembershipInvitationRow | null;
  }

  /**
   * Revokes an unaccepted invitation. `expiredBefore` (the expiry sweep, launch D84 (4)) also
   * requires it to have expired before that moment, so a resend racing the sweep keeps it.
   */
  async revoke(
    public_id: string,
    options: { expiredBefore?: Date } = {},
  ): Promise<MembershipInvitationRow | null> {
    const rows = await getRequestDatabase()
      .update(membership_invitations)
      .set({ revoked_at: new Date() })
      .where(
        and(
          eq(membership_invitations.public_id, public_id),
          isNull(membership_invitations.accepted_at),
          options.expiredBefore === undefined
            ? undefined
            : lt(membership_invitations.expires_at, options.expiredBefore),
        ),
      )
      .returning();
    return (rows[0] ?? null) as MembershipInvitationRow | null;
  }
}

/**
 * Still-`invited` memberships of live organizations whose latest invitation is open (not accepted,
 * not revoked) and expired before `expiredBefore`, oldest expiry first — the invitation expiry
 * sweep's read, across tenants (retention maintenance context).
 */
export async function findInvitedMembershipsDueForSeatRelease(
  databaseHandle: WorkerDatabaseHandle,
  options: { expiredBefore: Date; limit: number },
): Promise<Array<{ membership_public_id: string; organization_public_id: string }>> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  return databaseHandle
    .select({
      membership_public_id: memberships.public_id,
      organization_public_id: organizations.public_id,
    })
    .from(membership_invitations)
    .innerJoin(memberships, eq(memberships.id, membership_invitations.membership_id))
    .innerJoin(organizations, eq(organizations.id, memberships.organization_id))
    .where(
      and(
        eq(memberships.status, MEMBERSHIP_STATUS.INVITED),
        isNull(memberships.deleted_at),
        isNull(organizations.deleted_at),
        isNull(membership_invitations.accepted_at),
        isNull(membership_invitations.revoked_at),
        lt(membership_invitations.expires_at, options.expiredBefore),
        // The membership's latest invitation only — a member removed and invited again keeps the
        // earlier row.
        sql`NOT EXISTS (
          SELECT 1 FROM ${membership_invitations} AS newer_invitation
          WHERE newer_invitation.membership_id = ${membership_invitations.membership_id}
            AND (newer_invitation.created_at, newer_invitation.id)
              > (${membership_invitations.created_at}, ${membership_invitations.id})
        )`,
      ),
    )
    .orderBy(asc(membership_invitations.expires_at), asc(membership_invitations.id))
    .limit(options.limit);
}
