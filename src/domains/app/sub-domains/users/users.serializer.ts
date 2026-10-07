import type { MembershipOutput } from '@/domains/tenancy/sub-domains/membership/membership.types.js';
import type { AppUserOutput } from './users.types.js';

/** Shapes a membership as a picker entry — the name, colour, roles and branches only. */
export function serializeAppUser(membership: MembershipOutput): AppUserOutput {
  const { user } = membership;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
  return {
    id: membership.id,
    user_id: membership.user_id,
    name,
    avatar_url: user.avatar_url,
    staff_number: membership.staff_number,
    tone: membership.tone,
    role_ids: membership.role_ids,
    branch_ids: membership.branch_ids,
  };
}
