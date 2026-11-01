import { UnprocessableEntityError } from '@/shared/errors/index.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';

/** `tenancy.organizations.status` of an organization in use — anything else is suspended or archived. */
export const ACTIVE_ORGANIZATION_STATUS = 'ACTIVE';

/**
 * The codes the owner of a suspended or archived organization keeps — enough to read it and to
 * reactivate it (`PATCH /tenancy/organization` with `status`), nothing else (B2-3).
 *
 * @remarks
 * Every other member of such an organization resolves no permission at all and cannot switch into
 * it; its API keys are refused. The owner can still switch in, so the clinic is never locked out
 * for good.
 */
export const INACTIVE_ORGANIZATION_OWNER_PERMISSION_CODES: readonly string[] = [
  TENANCY_PERMISSIONS.ORGANIZATION_READ,
  TENANCY_PERMISSIONS.ORGANIZATION_UPDATE,
];

/**
 * A team-only capability a caller may attempt to exercise on an organization.
 * Selects the matching i18n rejection key in {@link assertTeamOrganization} when
 * the target is a PERSONAL organization.
 *
 * - `MEMBERS` — add or invite a second member (collaboration).
 * - `ROLES` — create or manage custom member roles.
 * - `MUTATION` — owner-level structural change (delete or transfer ownership).
 * - `BILLING` — manage the organization subscription (create / change plan / cancel / resume).
 * - `SETUP` — the clinic setup (feat-clinic-setup): a personal workspace has no clinic to set up.
 */
export type OrganizationCapability = 'MEMBERS' | 'ROLES' | 'MUTATION' | 'BILLING' | 'SETUP';

/** Organization `type` for a single-owner account workspace (no collaboration). */
const PERSONAL_ORGANIZATION_TYPE = 'PERSONAL';

/** Maps an attempted {@link OrganizationCapability} to its PERSONAL-organization rejection key. */
const CAPABILITY_REJECTION_KEY: Record<OrganizationCapability, string> = {
  MEMBERS: 'errors:personalOrganizationNoMembers',
  ROLES: 'errors:personalOrganizationNoRoles',
  MUTATION: 'errors:personalOrganizationImmutable',
  BILLING: 'errors:personalOrganizationNoBilling',
  SETUP: 'errors:personalOrganizationNoSetup',
};

/**
 * The machine-readable `reason` a rejection carries, where a route's contract names one
 * (feat-clinic-setup routes-final §2.A.9: `team_organization_required`).
 */
const CAPABILITY_REJECTION_REASON: Partial<Record<OrganizationCapability, string>> = {
  SETUP: 'team_organization_required',
};

/**
 * Whether `organization` is a single-owner PERSONAL workspace (no collaboration, no clinic) — the
 * test {@link assertTeamOrganization} applies, for a read that refuses a personal workspace with a
 * status of its own (a GET is never a 422 — the response-code policy keeps 422 for writes).
 */
export function isPersonalOrganization(organization: { type: string }): boolean {
  return organization.type === PERSONAL_ORGANIZATION_TYPE;
}

/**
 * Guards a team-only capability: rejects with 422 when `organization` is a
 * PERSONAL organization, otherwise returns without effect.
 *
 * @param organization - The target organization (only `type` is read).
 * @param capability - The capability being attempted; selects the i18n key.
 * @throws UnprocessableEntityError When the organization is PERSONAL — the organization
 *   `type` is immutable, so retrying the identical request can never succeed
 *   (422 `unprocessable_entity`, not 409).
 *
 * @remarks
 * - **Algorithm:** if `type === 'PERSONAL'`, throw `UnprocessableEntityError`
 *   keyed by {@link CAPABILITY_REJECTION_KEY} (with its {@link CAPABILITY_REJECTION_REASON}, when
 *   the capability has one); otherwise no-op.
 * - **Failure modes:** PERSONAL organization ⇒ 422 `unprocessable_entity`.
 * - **Side effects:** none (pure guard; throws or returns).
 * - **Notes:** single point of enforcement for the personal-vs-team rule, shared by
 *   membership-invitation, membership (add member / transfer ownership), member-role,
 *   organization delete, subscription billing (create / change-plan / cancel /
 *   resume), and the app's clinic setup. Team-only affordances are NOT advertised on the API response; a client
 *   derives them from the organization `type` and gates the action itself on the
 *   caller's permissions (e.g. `subscription:manage`).
 */
export function assertTeamOrganization({
  organization,
  capability,
}: {
  organization: { type: string };
  capability: OrganizationCapability;
}): void {
  if (isPersonalOrganization(organization)) {
    const error = new UnprocessableEntityError(CAPABILITY_REJECTION_KEY[capability]);
    const reason = CAPABILITY_REJECTION_REASON[capability];
    throw reason === undefined ? error : error.withReason(reason);
  }
}
