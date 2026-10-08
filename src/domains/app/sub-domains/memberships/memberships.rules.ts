import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { findMembershipIdOfUser } from '@/domains/app/base-record.repository.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ForbiddenError } from '@/shared/errors/index.js';

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
