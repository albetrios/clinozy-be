import { toHourMinute } from '@/shared/utils/validation/record-fields.util.js';
import type {
  MembershipAccessRefs,
  MembershipOutput,
  MembershipRow,
  MembershipUserSummary,
} from './membership.types.js';

/**
 * Shapes a `memberships` row into the HTTP response (launch §2.B.6). Every identifier is an
 * external public id: the membership's own `public_id`, the organization public id, the user summary
 * and the role and branch lists resolved by the caller. The internal sequential `user_id` /
 * `role_id` on the row are NEVER emitted (they leak enumerable ids and row counts). `invitation` is
 * the live pending invite (present only on `invited` rows); `ended_at` / `end_reason` are the
 * soft delete (D58); `is_owner` names the organization's owner (launch D81 (4)). Timestamps become
 * ISO-8601.
 */
export function serializeMembership(options: {
  row: MembershipRow;
  organization_public_id: string;
  user: MembershipUserSummary;
  invitation: { public_id: string; expires_at: Date } | null;
  access: MembershipAccessRefs;
  /** Whether this membership's login owns the organization. */
  is_owner: boolean;
}): MembershipOutput {
  const { row, user, invitation, access } = options;
  return {
    id: row.public_id,
    user_id: user.id,
    organization_id: options.organization_public_id,
    status: row.status,
    is_owner: options.is_owner,
    joined_at: row.joined_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    user,
    invitation:
      invitation === null
        ? null
        : { id: invitation.public_id, expires_at: invitation.expires_at.toISOString() },
    display_name: row.display_name,
    ended_at: row.deleted_at?.toISOString() ?? null,
    end_reason: row.delete_reason,
    staff_number: row.staff_number,
    phone: row.phone,
    tone: row.tone,
    role_ids: access.role_ids,
    branch_ids: access.branch_ids,
    working_days: row.working_days,
    work_starts_at: toHourMinute(row.work_starts_at),
    work_ends_at: toHourMinute(row.work_ends_at),
    commission_percent: Number(row.commission_percent),
  };
}
