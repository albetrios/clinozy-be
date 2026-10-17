import { ACTIVE_PLAN_ACCESS } from '@/domains/billing/sub-domains/subscription/subscription.constants.js';
import { serializePlanAccess } from '@/domains/billing/sub-domains/subscription/subscription.serializer.js';
import type { AuthMeContextData, AuthMeContextOutput } from './auth-me-context.types.js';

/**
 * Serializes the aggregated {@link AuthMeContextData} into the public
 * `GET /auth/me/context` response. Every field is already a public shape and
 * passes through unchanged, except the active organization, which gains its
 * `plan_access` (owner decision D3).
 *
 * @remarks
 * The organization LIST is not part of this response — it lives at
 * `GET /users/me/organizations`, which pages. Embedded here it was a flat array
 * with no cursor, so a caller in more than 25 organizations was silently
 * truncated.
 */
export function serializeAuthMeContext(data: AuthMeContextData): AuthMeContextOutput {
  // Already the public `OrganizationOutput` (tenancy's `serializeOrganization` lists its keys), so
  // it is extended, not re-listed.
  const organization = data.activeOrganization;
  return {
    user: data.user,
    active_organization: organization
      ? {
          ...organization,
          plan_access: serializePlanAccess(data.planAccess ?? ACTIVE_PLAN_ACCESS),
        }
      : null,
    membership_id: data.membershipId,
    my_permissions: data.myPermissions,
    my_role_ids: data.myRoleIds,
    my_roles: data.myRoles,
    global_role: data.globalRole,
  };
}
