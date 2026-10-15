import { env } from '@/shared/config/env.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { provisionPersonalOrganization } from '@/domains/tenancy/sub-domains/organization/organization-provisioning.js';
import { OrganizationRepository } from '@/domains/tenancy/sub-domains/organization/organization.repository.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';

/**
 * Orchestrates the login/active-organization lookups under the caller's own user RLS context. The
 * SQL lives in {@link OrganizationRepository}; these helpers only choose the context and map the
 * repository's `null` to `undefined` for their callers.
 *
 * @remarks
 * - **RLS:** every tenancy lookup runs under {@link withAppDatabaseContext (user scope)} via
 *   {@link withUserContextForInternalId}, which sets `app.current_user_public_id` so the
 *   `organizations_user_discovery` / `memberships_user_self_discovery` policies (migration
 *   `20260520000004`) match the caller's own rows. These reads must NOT run under the
 *   global-admin context: `tenancy.organizations` and `tenancy.memberships` are
 *   FORCE RLS and their policies honor only `app.current_organization_public_id` and `app.current_user_public_id`
 *   — never `app.global_admin` (only the `auth.*` and `audit.logs` policies carry that arm). Under
 *   the admin context every policy evaluates false and the memberships → organizations join returns
 *   zero rows, stranding users on the onboarding wizard once the login role lost BYPASSRLS.
 *   `provisionOrganization` was corrected for the same reason on the write side; this is the
 *   matching read-side fix.
 * - **Side effects:** none (read-only).
 */
const organizationRepository = new OrganizationRepository();

/**
 * Resolves `userInternalId` → `auth.users.public_id` through the `auth.resolve_user_by_internal_id`
 * SECURITY DEFINER resolver, then runs `callback` under {@link withAppDatabaseContext (user scope)} so the
 * tenancy policies see `app.current_user_public_id`.
 *
 * Returns `undefined` when the internal id resolves to no live user, so callers degrade to
 * "no organization" exactly as they did when the underlying query returned no rows.
 *
 * @remarks
 * The resolver replaces a `withMaintenanceDatabaseContext` wrapper. That wrapper worked — the
 * `auth.users` policy does carry an `app.global_admin` arm — but it opened the admin escape hatch
 * on a self-service login path (the same objection recorded in `provisionOrganization`) and cost a
 * second transaction on every login, refresh, and `getMe`. The resolver needs neither.
 */
async function withUserContextForInternalId<T>({
  userInternalId,
  callback,
}: {
  userInternalId: number;
  callback: () => Promise<T>;
}): Promise<T | undefined> {
  const userPublicId = await organizationRepository.resolveUserPublicIdByInternalId(userInternalId);
  if (userPublicId === null) return undefined;
  return withAppDatabaseContext({
    scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: userPublicId }),
    callback,
  });
}

/**
 * Resolve the default active organization for a user at login (every login path, and the
 * refresh fallback when a session's organization is no longer valid). When TEAM organizations
 * are enabled: the clinic the user pinned (`auth.user_settings.default_organization_id`, set
 * through `PATCH /users/me/settings`), else the clinic they last switched to
 * (`auth.users.last_active_organization_id`, stamped by `switch-to-organization`) — each only while
 * that membership is still active — else the most-recently-joined active TEAM membership, else the
 * PERSONAL organization (when `PERSONAL_ORGANIZATION_ENABLED`). With TEAM organizations disabled the PERSONAL organization
 * stays first. Returns the organization `public_id`, or `undefined` when the user belongs to no
 * eligible organization (team-only mode, no team yet → the frontend redirects to onboarding).
 *
 * @remarks
 * - **Algorithm:** one read under the user's own verified context —
 *   {@link OrganizationRepository.findDefaultActiveOrganizationPublicId}.
 * - **Notes:** a clinic is preferred over the personal workspace because a personal workspace has
 *   no clinic of its own and the frontend answers it with the organization picker — the login
 *   would otherwise stop there every time. A pinned or remembered clinic the user has left, or
 *   that is no longer active, fails the membership filter and is skipped; it never needs clearing.
 * - **Side effects:** none (read-only).
 */
export async function resolveDefaultActiveOrganizationPublicId(
  userInternalId: number,
): Promise<string | undefined> {
  const resolved = await withUserContextForInternalId({
    userInternalId,
    callback: () =>
      organizationRepository.findDefaultActiveOrganizationPublicId(
        userInternalId,
        env.PERSONAL_ORGANIZATION_ENABLED,
        env.TEAM_ORGANIZATION_ENABLED,
      ),
  });
  return resolved ?? undefined;
}

/**
 * Confirm the user holds an ACTIVE membership in the given organization (and the organization is
 * active/not-deleted), returning its internal `id`, `public_id` and `type`. Runs under the caller's own
 * user RLS context (no organization context at switch time) so the tenancy discovery policies match,
 * and the query is additionally constrained to the caller's own `user_id`.
 *
 * @remarks
 * - **Algorithm:** one indexed join (memberships → organizations) filtered to ACTIVE
 *   membership + active/non-deleted organization matching `organizationPublicId`.
 * - **Side effects:** none (read-only). Returns `undefined` when no such active
 *   membership exists (caller maps to 403, or falls back to a default organization).
 */
export async function findUserActiveOrganizationByPublicId({
  userInternalId,
  organizationPublicId,
}: {
  userInternalId: number;
  organizationPublicId: string;
}): Promise<{ id: number; public_id: string; type: string } | undefined> {
  const resolved = await withUserContextForInternalId({
    userInternalId,
    callback: () =>
      organizationRepository.findActiveMembershipOrganizationByPublicId(
        userInternalId,
        organizationPublicId,
      ),
  });
  return resolved ?? undefined;
}

/**
 * Confirm the user holds an ACTIVE membership in the given organization (and the organization is
 * active/not-deleted) — the membership gate for `switch-to-organization`. Returns the
 * organization `public_id` when valid, otherwise `undefined` (caller maps to 403). Runs under the caller's own
 * user RLS context (no organization context at switch time) so the tenancy discovery policies match,
 * and the query is additionally constrained to the caller's own `user_id`.
 */
export async function findUserActiveOrganizationPublicId({
  userInternalId,
  organizationPublicId,
}: {
  userInternalId: number;
  organizationPublicId: string;
}): Promise<string | undefined> {
  return (await findUserActiveOrganizationByPublicId({ userInternalId, organizationPublicId }))
    ?.public_id;
}

/**
 * Refresh-time revalidation of the active organization persisted on a session
 * (audit-#3). Given the session's stored internal `organization_id`, confirm the
 * user still holds an ACTIVE membership in that active/non-deleted organization and return
 * its `public_id`; otherwise `undefined` so the caller falls back to the default
 * active organization. Constrained to the caller's own `user_id` under that same
 * user RLS context (no organization context at refresh time).
 */
export async function findUserActiveOrganizationPublicIdByInternalId({
  userInternalId,
  organizationInternalId,
}: {
  userInternalId: number;
  organizationInternalId: number;
}): Promise<string | undefined> {
  const resolved = await withUserContextForInternalId({
    userInternalId,
    callback: () =>
      organizationRepository.findActiveMembershipOrganizationPublicIdByInternalId(
        userInternalId,
        organizationInternalId,
      ),
  });
  return resolved ?? undefined;
}

/**
 * Resolve the caller's own PERSONAL organization `public_id` — the target for
 * `switch-to-personal` (no body; the server resolves it). Returns `undefined` when the
 * user has no personal organization (e.g. personal disabled), which the caller maps to 409.
 * An optional public identity must come from the matching, already-resolved user row;
 * it avoids a repeated internal-id lookup while retaining that user's RLS context.
 */
export async function resolvePersonalOrganizationPublicId(options: {
  ownerUserInternalId: number;
  userPublicId?: string;
}): Promise<string | undefined> {
  if (options.userPublicId !== undefined) {
    // Profile reads already resolved the user. Keep the caller's own RLS scope while
    // avoiding another SECURITY DEFINER lookup of the same internal/public identity pair.
    const publicId = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: options.userPublicId }),
      callback: () =>
        organizationRepository.findPersonalOrganizationPublicId(options.ownerUserInternalId),
    });
    return publicId ?? undefined;
  }
  return (await resolvePersonalOrganization(options.ownerUserInternalId))?.public_id;
}

/**
 * Same as {@link resolvePersonalOrganizationPublicId} but returns both the
 * internal `id` and `public_id` so the switch-to-personal path can persist the
 * internal id on the session row (audit-#3).
 */
export async function resolvePersonalOrganization(
  ownerUserInternalId: number,
): Promise<{ id: number; public_id: string } | undefined> {
  const resolved = await withUserContextForInternalId({
    userInternalId: ownerUserInternalId,
    callback: () => organizationRepository.findPersonalOrganization(ownerUserInternalId),
  });
  return resolved ?? undefined;
}

/**
 * The user whose personal organization is resolved or provisioned: the internal id scopes the
 * queries, the public id is what logs carry.
 */
export interface PersonalOrganizationOwner {
  id: number;
  public_id: string;
}

/**
 * Resolve the caller's PERSONAL organization, **self-healing** on a miss: when
 * `PERSONAL_ORGANIZATION_ENABLED` is true and the user has no personal organization,
 * provision it on demand and return it. This closes the gap left by best-effort
 * signup-time provisioning (email first-verification / OAuth new-user), where a swallowed
 * failure or a flag flipped on after signup would otherwise leave a personal-enabled user
 * permanently without a personal workspace — dead-ending onboarding.
 *
 * Returns `undefined` only when personal organizations are **disabled** for the deployment
 * (`PERSONAL_ORGANIZATION_ENABLED=false`); in that mode we never create one, so callers
 * (`getMe` → `personal_organization_id: null`, `switch-to-personal` → 404) behave as before.
 *
 * @remarks
 * - **Idempotency:** `provisionPersonalOrganization` is guarded by the
 *   `idx_org_one_personal_per_owner` partial unique index (at most one personal organization per
 *   owner). A concurrent provision that loses the race raises a unique violation; we absorb it
 *   and re-resolve, so this function never creates a duplicate and never surfaces the race to
 *   the caller.
 * - **RLS:** provisioning runs inside its own `withAppDatabaseContext` write
 *   transaction scoped to the new org's pre-generated `public_id` (see
 *   {@link provisionPersonalOrganization}); the surrounding reads run under the caller's own
 *   user context, constrained to the caller's own `user_id`.
 * - **Side effects:** provisions one organization (+ owner role, permissions, membership)
 *   on the self-heal path; read-only when the personal organization already exists or personal is
 *   disabled.
 */
export async function ensurePersonalOrganization(
  owner: PersonalOrganizationOwner,
): Promise<{ id: number; public_id: string } | undefined> {
  const existing = await resolvePersonalOrganization(owner.id);
  if (existing) return existing;
  if (!env.PERSONAL_ORGANIZATION_ENABLED) return undefined;

  try {
    const provisioned = await provisionPersonalOrganization({ ownerUserId: owner.id });
    logger.info(
      {
        userPublicId: owner.public_id,
        organizationPublicId: provisioned.organization.public_id,
      },
      'personal_organization.self_heal.provisioned',
    );
    return {
      id: provisioned.organization.id,
      public_id: provisioned.organization.public_id,
    };
  } catch (error) {
    // A concurrent self-heal (or signup-time provision) may have won the race; the partial
    // unique index makes the second insert fail. Re-resolve and return the winner's row.
    const afterRace = await resolvePersonalOrganization(owner.id);
    if (afterRace) return afterRace;
    logger.error(
      { err: error, userPublicId: owner.public_id },
      'personal_organization.self_heal.failed',
    );
    throw error;
  }
}

/**
 * `public_id`-only, **read-safe** variant of {@link ensurePersonalOrganization} for
 * self-service read paths that must never fail because self-heal could not provision
 * (e.g. `getMe` → `personal_organization_id`). Attempts the on-demand provision, but if it
 * throws (a genuine provisioning failure — e.g. a missing reference row / transient DB error,
 * NOT a lost idempotency race, which {@link ensurePersonalOrganization} already absorbs) it
 * **degrades gracefully**: it logs and returns the pre-existing personal-organization id, or
 * `undefined` when there is still none. This guarantees a read like `GET /users/me` returns
 * 200 with `personal_organization_id: null` rather than 500-ing on a self-heal hiccup; the
 * user simply retries and the next read (or `switch-to-personal`) heals them once the
 * underlying cause clears. Returns `undefined` when personal organizations are disabled.
 *
 * @remarks
 * - **Side effects:** provisions on the happy path; on failure it is read-only (best-effort).
 * - **Contract:** callers get a non-throwing resolution — never propagate the provisioning
 *   error to the HTTP response.
 */
export async function ensurePersonalOrganizationPublicId(
  owner: PersonalOrganizationOwner,
): Promise<string | undefined> {
  try {
    return (await ensurePersonalOrganization(owner))?.public_id;
  } catch (error) {
    // Never let a self-heal failure break the read. Fall back to whatever already exists
    // (typically none → undefined → the caller reports null). ensurePersonalOrganization
    // already logged the failure at error level.
    logger.warn(
      { err: error, userPublicId: owner.public_id },
      'personal_organization.self_heal.read_degraded',
    );
    return (await resolvePersonalOrganization(owner.id))?.public_id;
  }
}
