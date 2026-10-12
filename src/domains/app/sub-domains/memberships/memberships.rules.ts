import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import { findMembershipIdOfUser } from '@/domains/app/base-record.repository.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ForbiddenError, ValidationError } from '@/shared/errors/index.js';

const MEMBERSHIP_NOT_FOUND_KEY = 'errors:validation.membershipNotFound';

/**
 * The 400 for `mem_` ids that are no live member of the organization, on the field that named them.
 *
 * @remarks The field message is a translation key, so a Spanish caller reads it in Spanish too.
 */
export function membershipNotFoundError(options: {
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
 * a 400 naming it on `field`.
 *
 * @remarks The one resolver for a list of team members an app record takes: who works at a branch
 * (`POST /branches`, `PUT /branches/{branch_id}/members` — launch D13) and who handles a contact
 * (`PUT /contacts/{contact_id}/members` — CT11).
 */
export async function resolveMembershipIds(options: {
  membershipService: MembershipService;
  organizationId: number;
  membershipPublicIds: readonly string[];
  field?: string;
}): Promise<Map<string, number>> {
  const resolved = await options.membershipService.resolveMembershipIdsByPublicIds({
    organizationId: options.organizationId,
    membershipPublicIds: options.membershipPublicIds,
  });
  const unknown = options.membershipPublicIds.filter((publicId) => !resolved.has(publicId));
  if (unknown.length > 0) {
    throw membershipNotFoundError({
      field: options.field ?? 'membership_ids',
      membershipPublicIds: unknown,
    });
  }
  return resolved;
}

/** The caller's own live membership in the active organization, as internal ids. */
export interface CallerMembership {
  organizationId: number;
  membershipId: number;
  userId: number;
}

/**
 * The caller's own membership — what a member's preferences and saved views belong to (launch U1).
 * Runs inside the caller's `withAppDatabaseContext`.
 *
 * @remarks
 * - **Algorithm:** the organization from the scope, the user from the acting user's public id, then
 *   their live membership there.
 * - **Failure modes:** `ForbiddenError('errors:ownMembershipRequired')` for an API key (no user) or
 *   a user with no live membership here.
 */
export async function requireCallerMembership(options: {
  organizationService: OrganizationService;
  scope: OrganizationPrincipalDatabaseScope;
  actingUserPublicId: string | undefined;
}): Promise<CallerMembership> {
  const organization = await options.organizationService.requireOrganizationByPublicId(
    options.scope.organizationPublicId,
  );
  const userId = await options.organizationService.resolveUserInternalIdByPublicId(
    options.actingUserPublicId,
  );
  const membershipId = await findMembershipIdOfUser({ organizationId: organization.id, userId });
  if (userId === null || membershipId === null) {
    throw new ForbiddenError('errors:ownMembershipRequired');
  }
  return { organizationId: organization.id, membershipId, userId };
}
