import type { MembershipOutput } from '@/domains/tenancy/sub-domains/membership/membership.types.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import type { AppMembershipOutput } from './memberships.types.js';

/** Shapes a membership as a picker entry — the name, colour, roles, branches and whether it is live. */
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
    ended_at: membership.ended_at,
  };
}
