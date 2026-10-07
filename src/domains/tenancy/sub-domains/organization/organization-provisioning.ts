import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { AUDIT_PERMISSIONS } from '@/domains/audit/audit.permissions.js';
import { BILLING_PERMISSIONS } from '@/domains/billing/billing.permissions.js';
import { NOTIFY_PERMISSIONS } from '@/domains/notify/notify.permissions.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { type AppRolePreset, appRolePresets } from '@/domains/app/app-role-presets.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { UPLOAD_PERMISSIONS } from '@/domains/upload/upload.permissions.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { role_permissions } from '@/domains/tenancy/sub-domains/member-roles/member-role-permission/member-role-permission.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import type { Organization } from '@/domains/tenancy/sub-domains/organization/organization.types.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';

/** Name of the auto-provisioned, undeletable owner role created with every organization. */
export const OWNER_ROLE_NAME = 'Owner';

/** Every tenancy permission code — part of the set the owner role is granted. */
const ALL_TENANCY_PERMISSION_CODES: readonly string[] = Object.values(TENANCY_PERMISSIONS);

/**
 * Every notify permission code — webhooks are a TEAM organization surface.
 *
 * @remarks
 * These codes were seeded into `tenancy.permissions` but granted to no role in
 * any organization, ever. `/notify/webhooks` therefore answered 403 to every
 * caller including the organization's own owner, and the frontend's integrations
 * panel — which gates its webhook section on `webhook:read` — rendered an
 * API-keys list under a heading that promised "API keys and webhooks". A
 * permission nothing can hold is not a security boundary, it is a dead route.
 */
const ALL_NOTIFY_PERMISSION_CODES: readonly string[] = Object.values(NOTIFY_PERMISSIONS);

/**
 * App record permission codes — granted to TEAM owners and the Admin role.
 *
 * @remarks
 * A business runs as a TEAM organization; a personal workspace holds no branches (D44), so these codes
 * join the TEAM half of {@link ownerPermissionCodesForOrganizationType} only.
 */
const ALL_APP_PERMISSION_CODES: readonly string[] = Object.values(APP_PERMISSIONS);

/**
 * Audit and upload permission codes — granted to every owner, TEAM and PERSONAL alike.
 *
 * @remarks
 * Both were the same dead-permission shape the notify codes above describe: seeded into
 * `tenancy.permissions` and granted to no role anywhere, so the routes enforcing them
 * answered 403 to every caller including the organization's own owner. Unlike billing and
 * notify these are not team surfaces — `/tenancy/organization/audit-logs` and `/uploads` are
 * both organization-scope `both`, and a personal workspace needs `upload:manage` to set its
 * own logo — so withholding them from PERSONAL would recreate the dead route it fixes.
 */
const ALL_AUDIT_PERMISSION_CODES: readonly string[] = Object.values(AUDIT_PERMISSIONS);

const ALL_UPLOAD_PERMISSION_CODES: readonly string[] = Object.values(UPLOAD_PERMISSIONS);

/**
 * Permission codes granted to the auto-provisioned Owner role.
 *
 * @remarks
 * Every owner receives the tenancy, audit and upload codes, plus **`subscription:read`**.
 * TEAM organizations additionally receive `subscription:manage` so the creator can use the
 * billing write routes, and notify read/manage so they can use `/notify/webhooks/*`.
 *
 * A PERSONAL owner gets the billing READ code because Billing is an **account-level**
 * surface they reach, and the route catalog already says so: every `subscription:read`
 * route is organization-scope `both`, while every team-only billing route requires
 * `subscription:manage`. Withholding the read code made those `both` routes unreachable
 * for the only person who can call them — the frontend's billing panel had nothing to
 * render and went blank.
 *
 * `subscription:manage` stays TEAM-only, and that is enforced twice over: the code is not
 * granted here, and `subscription.service.ts` calls `assertTeamOrganization(…, 'BILLING')`
 * on every write path regardless, so a personal organization is refused with 422 even if
 * the code were somehow held.
 */
export function ownerPermissionCodesForOrganizationType(
  type: ProvisionOrganizationInput['type'],
): readonly string[] {
  const everyOwnerCodes = [
    ...ALL_TENANCY_PERMISSION_CODES,
    ...ALL_AUDIT_PERMISSION_CODES,
    ...ALL_UPLOAD_PERMISSION_CODES,
    // Billing is account-level, so a personal owner reads it too; the write half stays TEAM.
    BILLING_PERMISSIONS.SUBSCRIPTION_READ,
  ];
  if (type === 'TEAM') {
    // Only what TEAM adds ON TOP of the base. Spreading the whole billing set here would
    // repeat `subscription:read`, and `role_permissions` is keyed on
    // (role_id, permission_code) — so provisioning a TEAM organization died on a duplicate
    // key rather than granting anything twice.
    return [
      ...everyOwnerCodes,
      BILLING_PERMISSIONS.SUBSCRIPTION_MANAGE,
      ...ALL_NOTIFY_PERMISSION_CODES,
      ...ALL_APP_PERMISSION_CODES,
    ];
  }
  return everyOwnerCodes;
}

/** A default non-owner role auto-provisioned into every TEAM organization (the clinic roles). */
export type DefaultTeamRole = AppRolePreset;

/**
 * Admin's codes: every team code but `organization:delete` (D8), billing, webhooks, audit logs,
 * uploads and every app code — the special permissions included.
 *
 * @remarks
 * Escalation to Owner stays closed on three independent paths —
 * `assertCallerCanGrantPermissionCodes` limits any grant to codes the caller already holds (so an
 * Admin can never hand out `organization:delete`), the same guard runs on membership create and
 * update (so an Admin cannot assign the Owner role to anyone), and `is_system` blocks editing the
 * Owner role itself.
 */
const ADMIN_PERMISSION_CODES: readonly string[] = [
  TENANCY_PERMISSIONS.ORGANIZATION_READ,
  TENANCY_PERMISSIONS.ORGANIZATION_UPDATE,
  TENANCY_PERMISSIONS.MEMBERSHIP_READ,
  TENANCY_PERMISSIONS.MEMBERSHIP_MANAGE,
  TENANCY_PERMISSIONS.INVITATION_MANAGE,
  TENANCY_PERMISSIONS.ROLE_READ,
  TENANCY_PERMISSIONS.ROLE_MANAGE,
  TENANCY_PERMISSIONS.API_KEY_READ,
  TENANCY_PERMISSIONS.API_KEY_MANAGE,
  TENANCY_PERMISSIONS.NOTIFICATION_POLICY_READ,
  TENANCY_PERMISSIONS.NOTIFICATION_POLICY_MANAGE,
  BILLING_PERMISSIONS.SUBSCRIPTION_READ,
  BILLING_PERMISSIONS.SUBSCRIPTION_MANAGE,
  NOTIFY_PERMISSIONS.WEBHOOK_READ,
  NOTIFY_PERMISSIONS.WEBHOOK_MANAGE,
  AUDIT_PERMISSIONS.AUDIT_LOG_READ,
  UPLOAD_PERMISSIONS.UPLOAD_MANAGE,
  ...ALL_APP_PERMISSION_CODES,
];

/**
 * Non-owner system roles seeded into every TEAM organization at provisioning time — the clinic
 * roles (Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing;
 * launch ROUTE #6/#7, D12) — so a new clinic can invite its team straight away.
 *
 * @remarks
 * - Every entry is `is_system: true`: its name is fixed and it cannot be deleted. Its access is
 *   each organization's to edit (D5), except Admin's — the one `is_locked` role (D40).
 * - PERSONAL organizations are single-member and reject custom roles, so they receive only Owner;
 *   these defaults apply to TEAM organizations exclusively.
 * - Every permission code must exist in the seeded `tenancy.permissions` reference table (the grant
 *   insert carries an FK to it). The presets live in `app-role-presets.ts`.
 */
export const DEFAULT_TEAM_ROLES: readonly DefaultTeamRole[] =
  appRolePresets(ADMIN_PERMISSION_CODES);

/** Input for {@link provisionOrganizationWithOwner}. */
export interface ProvisionOrganizationInput {
  name: string;
  /** Null for a PERSONAL organization; kebab string for a TEAM. */
  slug: string | null;
  type: 'PERSONAL' | 'TEAM';
  ownerUserId: number;
}

/** Result of {@link provisionOrganizationWithOwner}. */
export interface ProvisionOrganizationResult {
  organization: Organization;
  roleId: number;
  membershipPublicId: string;
}

/**
 * Atomically bootstrap an organization with full owner access: organization row →
 * system `Owner` role → every tenancy, audit and upload permission granted to it (plus billing
 * and notify read/manage for TEAM organizations) → the owner's ACTIVE membership. Without this, a freshly created
 * organization's owner resolves zero permissions (the permission path is a strict
 * role→membership join with no owner shortcut).
 *
 * @remarks
 * - **Algorithm:** pre-generates the organization `public_id` and runs every insert inside one
 *   `withAppDatabaseContext(PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: publicId }), …)` transaction, so `app.current_organization_public_id`
 *   equals the organization being created. The organization row then satisfies its tenant-isolation WITH CHECK
 *   (`public_id = app.current_organization_public_id`) and the child rows (roles, role_permissions,
 *   memberships) satisfy theirs (`organization_id` → the just-inserted organization) — all under the
 *   non-superuser `clinozy_be_app` role with NO admin escape hatch (the tenancy policies do not honor
 *   `app.global_admin`; only `auth`/`audit` do, which is why the former global-admin path failed
 *   its WITH CHECK with 42501 in deployed environments). One transaction keeps the owner-bootstrap
 *   atomic — a partial failure can never leave an organization whose owner has no access. TEAM
 *   organizations additionally insert the default {@link DEFAULT_TEAM_ROLES}
 *   (the clinic roles) and their grants so a new team can assign a role and invite members
 *   immediately; PERSONAL organizations get Owner only. This is a server-side bootstrap only;
 *   the inputs are not user-controlled beyond name/slug/type.
 * - **Failure modes:** the whole transaction rolls back on any insert failure (unique slug,
 *   one-personal-per-owner index, missing permission reference rows). Callers map
 *   `unique_violation` to a 409.
 * - **Side effects:** table inserts (organizations, roles, role_permissions, memberships); TEAM
 *   organizations additionally insert the default clinic roles (Admin locked) and their grants.
 * - **Notes:** the owner and default roles are `is_system: true` so they cannot be deleted via the
 *   role API. Permission reference rows (the `permissions` table) are assumed seeded — they are
 *   reference data present in every environment.
 */
export async function provisionOrganizationWithOwner(
  input: ProvisionOrganizationInput,
): Promise<ProvisionOrganizationResult> {
  return provisionOrganization(input);
}

/** Default display name for an auto-provisioned personal organization. */
export const PERSONAL_ORGANIZATION_NAME = 'Personal';

/**
 * Provision the single PERSONAL organization for a user at signup: a `type=PERSONAL`,
 * slug-less organization owned by the user, with full owner access. The partial unique
 * index guarantees at most one personal organization per owner.
 */
export async function provisionPersonalOrganization(
  ownerUserId: number,
  name: string = PERSONAL_ORGANIZATION_NAME,
): Promise<ProvisionOrganizationResult> {
  return provisionOrganization({
    name,
    slug: null,
    type: 'PERSONAL',
    ownerUserId,
  });
}

async function provisionOrganization(
  input: ProvisionOrganizationInput,
): Promise<ProvisionOrganizationResult> {
  // Pre-generate the organization public_id so the entire owner-bootstrap runs INSIDE the new org's own
  // RLS context (`app.current_organization_public_id` = this id): every tenant-isolation WITH CHECK then
  // passes naturally — the organization row (`public_id = app.current_organization_public_id`) and its child rows
  // (roles, role_permissions, memberships, all `organization_id`-scoped to the just-inserted organization).
  // This replaces `withMaintenanceDatabaseContext`, which was both improper on a self-service
  // login/signup path AND ineffective: the tenancy policies never honor `app.global_admin` (only
  // auth/audit do), so the organization INSERT failed its WITH CHECK with SQLSTATE 42501 under the
  // non-superuser `clinozy_be_app` role in deployed environments.
  const organizationPublicId = generatePublicId('organization');
  return withAppDatabaseContext(
    PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: organizationPublicId }),
    async (databaseHandle) => {
      const [organization] = await databaseHandle
        .insert(organizations)
        .values({
          public_id: organizationPublicId,
          name: input.name,
          slug: input.slug,
          type: input.type,
          owner_user_id: input.ownerUserId,
          created_by_user_id: input.ownerUserId,
          updated_by_user_id: input.ownerUserId,
        })
        .returning();

      const [role] = await databaseHandle
        .insert(roles)
        .values({
          public_id: generatePublicId('memberRole'),
          organization_id: organization!.id,
          name: OWNER_ROLE_NAME,
          is_system: true,
          created_by_user_id: input.ownerUserId,
        })
        .returning();

      await databaseHandle.insert(role_permissions).values(
        ownerPermissionCodesForOrganizationType(input.type).map((permission_code) => ({
          role_id: role!.id,
          permission_code,
          created_by_user_id: input.ownerUserId,
        })),
      );

      const [membership] = await databaseHandle
        .insert(memberships)
        .values({
          public_id: generatePublicId('membership'),
          user_id: input.ownerUserId,
          organization_id: organization!.id,
          role_id: role!.id,
          status: 'ACTIVE',
          joined_at: new Date(),
        })
        .returning();

      // TEAM organizations also receive the default clinic roles (Admin, Doctor, Therapist, Front
      // desk, Counsellor, Pharmacist, Accountant, Marketing) so the team can invite straight away. PERSONAL organizations are
      // single-member and reject custom roles, so they get Owner only.
      if (input.type === 'TEAM') {
        for (const defaultRole of DEFAULT_TEAM_ROLES) {
          const [defaultRoleRow] = await databaseHandle
            .insert(roles)
            .values({
              public_id: generatePublicId('memberRole'),
              organization_id: organization!.id,
              name: defaultRole.name,
              description: defaultRole.description,
              tone: defaultRole.tone,
              is_system: true,
              is_locked: defaultRole.isLocked,
              created_by_user_id: input.ownerUserId,
            })
            .returning();

          await databaseHandle.insert(role_permissions).values(
            defaultRole.permissionCodes.map((permission_code) => ({
              role_id: defaultRoleRow!.id,
              permission_code,
              created_by_user_id: input.ownerUserId,
            })),
          );
        }
      }

      return {
        organization: organization! as Organization,
        roleId: role!.id,
        membershipPublicId: membership!.public_id,
      };
    },
  );
}
