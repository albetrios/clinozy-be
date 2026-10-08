import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import { ValidationError } from '@/shared/errors/index.js';

const MEMBERSHIP_NOT_FOUND_KEY = 'errors:validation.branchMembershipNotFound';

/**
 * The 400 for `mem_` ids that are no live member of the organization, on the field that named them.
 *
 * @remarks The field message is a translation key, so a Spanish caller reads it in Spanish too.
 */
export function branchMembershipNotFoundError(options: {
  field: string;
  membershipPublicIds: readonly string[];
}): ValidationError {
  const params = { membership_id: options.membershipPublicIds.join(', ') };
  return new ValidationError(MEMBERSHIP_NOT_FOUND_KEY, params, undefined, [
    { field: options.field, messageKey: MEMBERSHIP_NOT_FOUND_KEY, messageParams: params },
  ]);
}

/**
 * `membership_ids` → the organization's live membership ids, keyed by public id; any unknown id is
 * a 400 naming it.
 *
 * @remarks The one resolver for who works at a branch: `POST /branches` (D13) and
 * `PUT /branches/{branch_id}/members` both call it.
 */
export async function resolveBranchMembershipIds(options: {
  membershipService: MembershipService;
  organizationId: number;
  membershipPublicIds: readonly string[];
}): Promise<Map<string, number>> {
  const resolved = await options.membershipService.resolveMembershipIdsByPublicIds({
    organizationId: options.organizationId,
    membershipPublicIds: options.membershipPublicIds,
  });
  const unknown = options.membershipPublicIds.filter((publicId) => !resolved.has(publicId));
  if (unknown.length > 0) {
    throw branchMembershipNotFoundError({ field: 'membership_ids', membershipPublicIds: unknown });
  }
  return resolved;
}
