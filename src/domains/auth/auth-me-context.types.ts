import type { GlobalRole } from '@/shared/constants/roles.constants.js';
import type { UserOutput } from '@/domains/user/user.types.js';
import type { OrganizationOutput } from '@/domains/tenancy/sub-domains/organization/organization.types.js';
import type { CallerRoleSummary } from '@/domains/tenancy/sub-domains/membership/membership.types.js';
import type {
  PlanAccess,
  PlanAccessOutput,
} from '@/domains/billing/sub-domains/subscription/subscription.types.js';

/** Aggregated, pre-serialization context assembled by `AuthMeContextService.getContext`. */
export interface AuthMeContextData {
  user: UserOutput;
  activeOrganization: OrganizationOutput | null;
  /** The active organization's plan access (owner decision D3); `null` without an active organization. */
  planAccess: PlanAccess | null;
  /** The caller's membership in the active organization (`mem_…`); `null` without one (N10). */
  membershipId: string | null;
  myPermissions: string[];
  /** The caller's roles in the active organization, the main role first (D5); `[]` without one. */
  myRoleIds: string[];
  /** The same roles, each named (S3). */
  myRoles: CallerRoleSummary[];
  globalRole: GlobalRole | null;
}

/** The active organization in `GET /api/v1/auth/me/context`: the organization plus its plan access. */
export type AuthMeContextActiveOrganizationOutput = OrganizationOutput & {
  /**
   * Whether the clinic may still write in the clinic rooms (owner decision D3): `active`, `grace`
   * (unpaid, writes allowed until `grace_ends_at`) or `read_only` (unpaid since `grace_ends_at`;
   * every write under `/api/v1/app/` answers 403 `organization_read_only`).
   */
  plan_access: PlanAccessOutput;
};

/** Public response body for `GET /api/v1/auth/me/context`. */
export interface AuthMeContextOutput {
  /** The authenticated caller's own profile (same shape as `GET /users/me`). */
  user: UserOutput;
  /**
   * The active organization (with type-derived `capabilities`) and its `plan_access`, or `null` when
   * no organization is in scope.
   */
  active_organization: AuthMeContextActiveOrganizationOutput | null;
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
