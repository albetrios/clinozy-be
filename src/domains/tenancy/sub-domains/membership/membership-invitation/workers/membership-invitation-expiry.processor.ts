import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { captureException } from '@/infrastructure/observability/sentry/sentry.js';
import { membership_invitations } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { MILLISECONDS_PER_DAY } from '@/shared/constants/index.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  MEMBERSHIP_INVITATION_EXPIRY_BATCH,
  MEMBERSHIP_INVITATION_SEAT_RELEASE_DAYS,
} from './membership-invitation-expiry.constants.js';

/**
 * The one service step the sweep drives — `MembershipService.endExpiredInvitation`.
 *
 * @remarks Structural (not the full `MembershipService`) so the processor depends only on the
 * one idempotent method it calls and stays unit-testable with a stub.
 */
export interface MembershipInvitationExpiryService {
  endExpiredInvitation(options: {
    organizationPublicId: string;
    membershipPublicId: string;
    expiredBefore: Date;
  }): Promise<boolean>;
}

/**
 * Outcome of one sweep tick.
 *
 * @remarks `scanned` is the number of due invited memberships found this tick (bounded by
 * `MEMBERSHIP_INVITATION_EXPIRY_BATCH`); `ended` + `skipped` (no longer due when re-checked in
 * the organization's context) + `failed` partition them.
 */
export interface MembershipInvitationExpiryResult {
  scanned: number;
  ended: number;
  skipped: number;
  failed: number;
}

/**
 * Ends the invited memberships whose invitation expired more than
 * {@link MEMBERSHIP_INVITATION_SEAT_RELEASE_DAYS} days ago, so a forgotten invite stops holding a
 * seat (launch D84 (4), ROUTE #175).
 *
 * @remarks
 * - **Algorithm:** under the global-retention cleanup context (a cross-organization read), up to
 *   {@link MEMBERSHIP_INVITATION_EXPIRY_BATCH} still-`invited` memberships of live organizations
 *   whose latest invitation is open (not accepted, not revoked) and expired before the cutoff,
 *   oldest expiry first; then, outside that context, `endExpiredInvitation` for each — the
 *   service opens the membership's own organization context, re-checks every condition, revokes
 *   the invitation and ends the membership (`invitation_expired`) through the leave step, and
 *   syncs the seat count after commit.
 * - **Failure modes:** a per-membership failure is counted, warn-logged and reported to Sentry;
 *   the row stays due for the next tick. A scan error propagates to BullMQ retry / DLQ.
 * - **Side effects:** see `MembershipService.endExpiredInvitation`.
 * - **Notes:** idempotent — anything accepted, resent or removed since the scan is a skip. An
 *   admin can invite the person again at any time. Scheduled daily via
 *   `infrastructure/queue/scheduler.ts`.
 */
export async function runMembershipInvitationExpiryJob(
  service: MembershipInvitationExpiryService,
  now: Date = new Date(),
): Promise<MembershipInvitationExpiryResult> {
  const expiredBefore = new Date(
    now.getTime() - MEMBERSHIP_INVITATION_SEAT_RELEASE_DAYS * MILLISECONDS_PER_DAY,
  );

  const due = await withMaintenanceDatabaseContext(
    MAINTENANCE_SCOPE.GLOBAL_RETENTION_CLEANUP,
    (databaseHandle) =>
      databaseHandle
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
            lt(membership_invitations.expires_at, expiredBefore),
            // The membership's latest invitation only — a member removed and invited again
            // keeps the earlier row.
            sql`NOT EXISTS (
              SELECT 1 FROM ${membership_invitations} AS newer_invitation
              WHERE newer_invitation.membership_id = ${membership_invitations.membership_id}
                AND (newer_invitation.created_at, newer_invitation.id)
                  > (${membership_invitations.created_at}, ${membership_invitations.id})
            )`,
          ),
        )
        .orderBy(asc(membership_invitations.expires_at), asc(membership_invitations.id))
        .limit(MEMBERSHIP_INVITATION_EXPIRY_BATCH),
  );

  let ended = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of due) {
    try {
      const wasEnded = await service.endExpiredInvitation({
        organizationPublicId: row.organization_public_id,
        membershipPublicId: row.membership_public_id,
        expiredBefore,
      });
      if (wasEnded) ended += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      logger.warn(
        { error, membershipPublicId: row.membership_public_id },
        'membership-invitation-expiry.end_failed',
      );
      captureException(error, {
        organizationId: row.organization_public_id,
        tags: { source: 'membership-invitation-expiry' },
      });
    }
  }

  if (due.length > 0) {
    logger.info(
      { scanned: due.length, ended, skipped, failed },
      'membership-invitation-expiry.completed',
    );
  }

  return { scanned: due.length, ended, skipped, failed };
}
