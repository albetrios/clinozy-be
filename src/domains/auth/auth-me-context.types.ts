import type { GlobalRole } from '@/shared/constants/roles.constants.js';
import type { UserOutput } from '@/domains/user/user.types.js';
import type { OrganizationOutput } from '@/domains/tenancy/sub-domains/organization/organization.types.js';
import type { CallerRoleSummary } from '@/domains/tenancy/sub-domains/membership/membership.types.js';

/** Aggregated, pre-serialization context assembled by `AuthMeContextService.getContext`. */
export interface AuthMeContextData {
  user: UserOutput;
  activeOrganization: OrganizationOutput | null;
  /** The caller's membership in the active organization (`mem_…`); `null` without one (N10). */
  membershipId: string | null;
  myPermissions: string[];
  /** The caller's roles in the active organization, the main role first (D5); `[]` without one. */
  myRoleIds: string[];
  /** The same roles, each named (S3). */
  myRoles: CallerRoleSummary[];
  globalRole: GlobalRole | null;
}

/** Public response body for `GET /api/v1/auth/me/context`. */
export interface AuthMeContextOutput {
  /** The authenticated caller's own profile (same shape as `GET /users/me`). */
  user: UserOutput;
  /** The active organization (with type-derived `capabilities`), or `null` when no organization is in scope. */
  active_organization: OrganizationOutput | null;
  /**
   * The caller's own membership in the active organization (`mem_…` — the id `GET /app/memberships`
   * rows carry, launch ROUTE #156, N10); `null` with no active organization or no live membership.
   */
  membership_id: string | null;
  /** Permission codes the caller holds in the active organization (e.g. `["organization:read", …]`). */
  my_permissions: string[];
  /** The caller's roles in the active organization (`rol_…`), the main role first (D5); `[]` without one. */
  my_role_ids: string[];
  /**
   * The same roles, in the same order, each with its `name`, `tone` and `is_system` — so a member
   * without `role:read` can name their own role (launch ROUTE #156, S3); `[]` without one.
   */
  my_roles: CallerRoleSummary[];
  /**
   * The caller's platform-wide role, or `null` for a standard user.
   *
   * @remarks
   * The organization LIST is deliberately not here — it lives at
   * `GET /users/me/organizations`. Embedded, it was a flat array with no cursor,
   * filled by a default-paginated read: a caller in more than 25 organizations
   * got a silently truncated switcher and no way to ask for the rest. The
   * dedicated endpoint pages properly, and the client can fetch it alongside
   * this call rather than behind it.
   */
  global_role: GlobalRole | null;
}
