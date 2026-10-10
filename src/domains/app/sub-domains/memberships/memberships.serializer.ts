import type { MembershipOutput } from '@/domains/tenancy/sub-domains/membership/membership.types.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import type { MemberRoleRow } from '@/domains/tenancy/sub-domains/member-roles/member-role.types.js';
import type { AppMembershipOutput, AppRoleOutput } from './memberships.types.js';

/**
 * Shapes a membership as a picker entry — the name, colour, roles, branches, whether it is live and
 * whether it is the organization's owner.
 */
export function serializeAppMembership(membership: MembershipOutput): AppMembershipOutput {
  return {
    id: membership.id,
    user_id: membership.user_id,
    display_name: membership.display_name,
    avatar_url: membership.user.avatar_url,
    staff_number: membership.staff_number,
    tone: membership.tone,
    role_ids: membership.role_ids,
    branch_ids: membership.branch_ids,
    is_active: membership.ended_at === null && membership.status === MEMBERSHIP_STATUS.ACTIVE,
    is_owner: membership.is_owner,
    ended_at: membership.ended_at,
  };
}

/** Shapes a role as a directory entry — its name, colour and whether it is a fixed or locked role. */
export function serializeAppRole(
  role: Pick<MemberRoleRow, 'public_id' | 'name' | 'tone' | 'is_system' | 'is_locked'>,
): AppRoleOutput {
  return {
    id: role.public_id,
    name: role.name,
    tone: role.tone,
    is_system: role.is_system,
    is_locked: role.is_locked,
  };
}
