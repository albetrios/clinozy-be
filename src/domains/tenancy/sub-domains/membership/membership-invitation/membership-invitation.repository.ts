import { and, asc, count, desc, eq, gt, isNull, lt, type SQL } from 'drizzle-orm';
import { sql } from '@/infrastructure/database/connection.js';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { membership_invitations } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
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
    const cursorCondition = buildAscendingCreatedAtIdCursorCondition(
      membership_invitations.created_at,
      membership_invitations.id,
      parseListCursor(after),
    );
    const where =
      cursorCondition !== undefined ? and(...filterConditions, cursorCondition) : countWhere;

    const rowsPromise = getRequestDatabase()
      .select({
        invitation: membership_invitations,
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
    const hasMore = fetchedRows.length > limit;
    const rows = hasMore ? fetchedRows.slice(0, limit) : fetchedRows;
    const items = rows.map((row) => ({
      ...row.invitation,
      membership_public_id: row.membership_public_id,
    }));
    const lastItem = items.at(-1);
    return {
      items,
      total,
      limit,
      has_more: hasMore,
      next_cursor: hasMore && lastItem !== undefined ? createOpaqueCursorFromRow(lastItem) : null,
    };
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
    await acquireResourceQuotaLock(
      RESOURCE_QUOTA_LOCK_NAMESPACE.MEMBERSHIP_INVITATION,
      organization_id,
    );
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
    const rows = await sql<
      Array<{
        organization_public_id: string;
        organization_id: string | number;
        membership_public_id: string;
        membership_id: string | number;
      }>
    >`
      SELECT
        organization_public_id,
        organization_id,
        membership_public_id,
        membership_id
      FROM tenancy.resolve_membership_invitation_lookup_by_public_id(${invitation_public_id})
    `;
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
   * - **Notes:** the caller passes a verified email only — the function trusts its argument.
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
    // ISO text: this client binds no Date parameters in a raw tagged template.
    const afterCreatedAt = cursor?.id === undefined ? null : cursor.created_at.toISOString();
    const afterId = cursor?.id ?? null;
    const rows = await sql<
      Array<{
        invitation_id: string | number;
        invitation_public_id: string;
        organization_public_id: string;
        organization_name: string;
        organization_slug: string | null;
        organization_logo_url: string | null;
        membership_public_id: string;
        role_names: string[] | null;
        inviter_name: string | null;
        invitation_expires_at: Date;
        invitation_created_at: Date;
      }>
    >`
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
        invitation_created_at
      FROM tenancy.list_pending_membership_invitations_for_email(
        ${email},
        ${pagination.limit + 1},
        ${afterCreatedAt},
        ${afterId}
      )
    `;
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
    const lastItem = items.at(-1);
    return {
      items,
      limit: pagination.limit,
      has_more: hasMore,
      next_cursor:
        hasMore && lastItem !== undefined
          ? createOpaqueCursorFromRow({
              created_at: lastItem.created_at,
              id: lastItem.invitation_id,
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
    return runInsertWithPublicIdentifierRetry(async () => {
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
