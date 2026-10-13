import {
  ConfigurationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/shared/errors/index.js';
import { isPostgresUniqueViolation } from '@/shared/utils/infrastructure/postgres-error.util.js';
import { isDisposableEmailBlocked } from '@/shared/utils/text/email.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { assertRecordNotChangedSince } from '@/shared/utils/validation/record-fields.util.js';
import {
  MAINTENANCE_SCOPE,
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
  withMaintenanceDatabaseContext,
  type OrganizationPrincipalDatabaseScope,
  type UserPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';
import {
  acquireResourceQuotaLock,
  RESOURCE_QUOTA_LOCK_NAMESPACE,
} from '@/infrastructure/database/resource-quota-lock.util.js';
import type { UserSettingsService } from '@/domains/user/sub-domains/user-settings/user-settings.service.js';
import {
  isFactoryDefaultUserLocaleSettings,
  preferredLocalesForOrganizationDefaultLocale,
} from '@/domains/user/sub-domains/user-settings/user-settings-locale-defaults.util.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationMembershipContext } from '@/domains/tenancy/sub-domains/organization/organization.types.js';
import { assertTeamOrganization } from '@/domains/tenancy/sub-domains/organization/organization-capability.js';
import type { OrganizationSettingsService } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.service.js';
import type { MemberRoleService } from '@/domains/tenancy/sub-domains/member-roles/member-role.service.js';
import type { MemberRolePermissionService } from '@/domains/tenancy/sub-domains/member-roles/member-role-permission/member-role-permission.service.js';
import type { AuthorizationService } from '@/domains/tenancy/sub-domains/permission/authorization.service.js';
import type { PermissionRepository } from '@/domains/tenancy/sub-domains/permission/permission.repository.js';
import {
  assertCallerCanGrantPermissionCodes,
  assertCallerHoldsMemberPermissionCodes,
} from '@/domains/tenancy/sub-domains/permission/assert-grantable-permissions.util.js';
import type { MembershipListQuery, MembershipRepository } from './membership.repository.js';
import {
  type CallerMembershipContext,
  type MembershipAccessRefs,
  type MembershipActionOptions,
  type MembershipOutput,
  type MembershipProfileData,
  type MembershipRow,
  membershipStatusConsumesSeat,
  type MembershipUserSummary,
} from './membership.types.js';
import {
  validateCreateMembership,
  validateDeleteMembershipQuery,
  validateUpdateMembership,
  validateListMembershipsQuery,
  validateTransferOwnership,
} from './membership.validator.js';
import { serializeMembership } from './membership.serializer.js';
import { buildDomainEvent, eventBus } from '@/core/events/event-bus.js';
import type { OrganizationResourceEventPayload } from '@/core/events/organization-resource-event.js';
import { MEMBERSHIP_EVENT, type MembershipEventType } from './events/membership.events.js';
import { resolveStoredMediaReadUrl } from '@/shared/utils/infrastructure/media-url.util.js';
import type { ObjectStoragePort } from '@/infrastructure/storage/object-storage.port.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { MembershipInvitationService } from './membership-invitation/membership-invitation.service.js';
import {
  attachInvitationTokenEcho,
  serializeMembershipInvitation,
} from './membership-invitation/membership-invitation.serializer.js';
import type { MembershipInvitationOutput } from './membership-invitation/membership-invitation.types.js';
import { invalidatePermissions } from '@/domains/tenancy/sub-domains/permission/permission-cache.service.js';
import type { OrganizationApiKeyRepository } from '@/domains/tenancy/sub-domains/organization/organization-api-key/organization-api-key.repository.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { MembershipAdditionalRolesRepository } from './membership-additional-roles/membership-additional-roles.repository.js';
import {
  MEMBERSHIP_DELETE_REASON,
  MEMBERSHIP_STATUS,
  type MembershipDeleteReason,
} from './membership.constants.js';
import type { CreateMembershipInput, UpdateMembershipInput } from './membership.dto.js';

/** A role row as the member-role service resolves it. */
type ResolvedRole = Awaited<ReturnType<MemberRoleService['requireRoleRecordForOrganization']>>;

/** What serializing a membership needs of its organization: the public id and who owns it. */
type SerializingOrganization = Pick<OrganizationMembershipContext, 'public_id' | 'owner_user_id'>;

/**
 * The app domain's branch access, as the membership routes need it (launch ROUTE #4): read and
 * replace the branches a member works in (`app.branch_members`).
 *
 * @remarks
 * - **Algorithm:** the app domain is built on the tenancy membership service, so the reverse
 *   dependency is late-wired by the composition root via
 *   {@link MembershipService.wireBranchAccess} — never a constructor param.
 * - **Failure modes:** `replaceBranchesForMembership` throws a `ValidationError` on `branch_ids`
 *   for an id that is no live branch of the organization.
 * - **Side effects:** a replace deletes and inserts access rows, inside the caller's context.
 */
export type MembershipBranchAccessPort = {
  listBranchPublicIdsByMembershipIds(options: {
    membershipIds: readonly number[];
  }): Promise<Map<number, string[]>>;
  /** The memberships that work at a branch (the list filter, T2); null for an unknown branch. */
  listMembershipIdsAtBranch(options: {
    organizationId: number;
    branchPublicId: string;
  }): Promise<number[] | null>;
  replaceBranchesForMembership(options: {
    organizationId: number;
    membershipId: number;
    branchPublicIds: readonly string[];
    createdByUserId: number | null;
  }): Promise<void>;
};

/**
 * What ending a membership does in the app (launch K4), satisfied by the app domain.
 *
 * @remarks
 * - **Algorithm:** {@link MembershipService} calls `releaseEndedMembership` inside the same
 *   organization transaction that ends the membership — for a removal, for leaving and for a
 *   deleted account alike — so what the person *does now* (branch access, default staff, contact
 *   handling, lead ownership, open tasks) is cleared and what is *theirs alone* (preferences, saved
 *   views, prescription kits) goes in one step, while what they *did* stays. Each app sub-domain
 *   adds its part to the app's leave step as it is built.
 * - **Failure modes:** an error rolls the whole leave back — the membership is not ended.
 * - **Notes:** late-wired via {@link MembershipService.wireLeaveStep}, like the branch access, so
 *   tenancy does not import the app domain; a minimal harness without it ends the membership only.
 */
export type MembershipLeavePort = {
  releaseEndedMembership(options: { organizationId: number; membershipId: number }): Promise<void>;
};

/**
 * Cross-domain port for REQ-4 seat enforcement and Stripe seat reconciliation, satisfied by
 * billing's `SubscriptionService`.
 *
 * @remarks
 * - **Algorithm:** declared as a minimal structural interface (not a `SubscriptionService` import)
 *   so tenancy does not depend on billing — billing already depends on tenancy, so importing the
 *   concrete service here would create a cycle. The composition root late-wires the concrete
 *   service in via {@link MembershipService.wireSeatEnforcement}.
 * - **Failure modes:** `reserveSeatCeilingForMemberAdd` returns `null` (no ceiling) when the organization has
 *   no active subscription or the plan is unlimited; the implementer takes a row lock so concurrent
 *   adds serialize. `enqueueSeatQuantitySync` is best-effort (swallows enqueue failures).
 * - **Side effects:** the implementer acquires a `FOR UPDATE` lock (reserve) / enqueues a job (sync).
 */
export type MembershipSeatEnforcementPort = {
  reserveSeatCeilingForMemberAdd(organizationId: number): Promise<number | null>;
  enqueueSeatQuantitySync(options: {
    organization_public_id: string;
    idempotencyKey?: string | undefined;
  }): void;
};

/**
 * HTTP response shape for `GET /organization/memberships/:membership_id/permissions` — the
 * member's effective codes (launch §2.B.6 "Member permissions", T15).
 *
 * @remarks
 * - **Algorithm:** the union of the codes of every role the member holds, main and extra (D5).
 * - **Failure modes:** carries no state of its own; producers raise
 *   `NotFoundError('Membership')` when the membership cannot be resolved (or has ended).
 * - **Side effects:** none — this is a plain DTO.
 * - **Notes:** codes are flat strings matching the entries in `tenancy.permissions`.
 */
export interface MembershipPermissionsOutput {
  permission_codes: string[];
}

/**
 * What the team picker asks of the membership list (launch §2.A, K5): the filters already parsed by
 * the app's `GET /app/memberships` DTO.
 *
 * @remarks
 * - **Notes:** a role and a branch are public ids — an unknown one is an empty page, never a 400;
 *   `includeEnded` lists every membership (any status, live or ended), otherwise live active ones.
 */
export interface MembershipDirectoryQuery {
  q?: string | undefined;
  rolePublicId?: string | undefined;
  branchPublicId?: string | undefined;
  /** Only members one of whose roles grants this code (T8); an unknown code matches nobody. */
  holdsPermissionCode?: string | undefined;
  /** Every membership — any status, live or ended; otherwise live active members only. */
  includeEnded: boolean;
  publicIds?: readonly string[] | undefined;
  limit: number;
  after?: string | undefined;
}

/**
 * The 403 for a change the organization owner's membership never takes — their status, their main
 * role, their removal (sec-new-T1): ownership is handed over first.
 *
 * @remarks
 * - **Notes:** `reason: owner_membership_fixed` (launch D81 (4)) so a client tells it from a
 *   missing permission; the owner's extra roles and staff profile stay editable.
 */
function ownerMembershipFixedError(messageKey: string): ForbiddenError {
  return new ForbiddenError(messageKey).withReason('owner_membership_fixed');
}

/**
 * The checks of an edit of a live member (T10, K3, sec-new-T1): their name follows their profile,
 * the owner's status is locked, working hours end after they start, and an invited member's status
 * moves only by accepting the invite. The owner's roles are checked once resolved
 * ({@link assertOwnerKeepsMainRole}).
 *
 * @remarks
 * - **Failure modes:** `ValidationError` on `display_name`, `work_ends_at`, `status`;
 *   `ForbiddenError` (`owner_membership_fixed`) for the owner's status.
 */
function assertLiveMembershipEdit(options: {
  parsed: UpdateMembershipInput;
  membership: { user_id: number; status: string; work_starts_at: string; work_ends_at: string };
  ownerUserId: number | null;
}): void {
  const { parsed, membership } = options;
  if (parsed.display_name !== undefined) {
    // K3: a live member's name follows their profile in every organization.
    throw new ValidationError(
      'errors:validation.membershipNameFollowsProfile',
      undefined,
      undefined,
      [{ field: 'display_name', messageKey: 'errors:validation.membershipNameFollowsProfile' }],
    );
  }
  /**
   * sec-new-T1: The organization owner's membership must not be modified by other members.
   * An Admin holding MEMBERSHIP_UPDATE could otherwise SUSPEND the owner, locking
   * them out of all RBAC-gated routes with no self-recovery path. The ownership
   * transfer endpoint is the correct mechanism for any ownership-adjacent change.
   */
  // The owner's staff profile (phone, tone, hours, branches) and extra roles stay editable; their
  // status is locked, and so is their main role (assertOwnerKeepsMainRole).
  if (parsed.status !== undefined && options.ownerUserId === membership.user_id) {
    throw ownerMembershipFixedError('errors:ownerMembershipCannotBeModified');
  }
  // Working hours: the DTO checks both ends when both come; one end is checked against the row.
  const workStartsAt = parsed.work_starts_at ?? membership.work_starts_at.slice(0, 5);
  const workEndsAt = parsed.work_ends_at ?? membership.work_ends_at.slice(0, 5);
  if (workEndsAt <= workStartsAt) {
    throw new ValidationError('errors:validation.workEndsBeforeStarts', undefined, undefined, [
      { field: 'work_ends_at', messageKey: 'errors:validation.workEndsBeforeStarts' },
    ]);
  }
  // T10: status moves only between active and suspended — an invited member becomes active
  // only by accepting the invite.
  if (
    parsed.status !== undefined &&
    parsed.status !== membership.status &&
    membership.status === MEMBERSHIP_STATUS.INVITED
  ) {
    throw new ValidationError('errors:validation.membershipStatusMove', undefined, undefined, [
      { field: 'status', messageKey: 'errors:validation.membershipStatusMove' },
    ]);
  }
}

/**
 * The owner may hold extra roles (launch D81 (4) — the owner is often the clinic's doctor), but
 * their main role stays first: a `role_ids` whose first role is not the one they hold now is
 * refused, so the owner never loses the role that gives them the whole organization.
 *
 * @remarks
 * - **Failure modes:** `ForbiddenError` (`owner_membership_fixed`) when the main role would change.
 * - **Notes:** the grant guard still runs after it — the caller must hold every code of every role
 *   in the new set, so in practice the owner sets their own extra roles.
 */
function assertOwnerKeepsMainRole(options: {
  membership: { user_id: number; role_id: number };
  ownerUserId: number | null;
  mainRoleId: number | undefined;
}): void {
  if (options.ownerUserId !== options.membership.user_id) return;
  if (options.mainRoleId !== options.membership.role_id) {
    throw ownerMembershipFixedError('errors:ownerMembershipCannotBeModified');
  }
}

/**
 * Application service for organization memberships: list/get/create/update/
 * delete, plus self-service `leaveOrganization` and `transferOwnership`.
 *
 * @remarks
 * - **Algorithm:** every public method runs inside
 *   {@link withAppDatabaseContext} and resolves the caller's
 *   organization through
 *   {@link OrganizationService.requireOrganizationRecordByPublicId}
 *   before touching the membership repository. `transferOwnership` is
 *   delegated to {@link OrganizationService.transferOrganizationOwnership} so
 *   the `owner_user_id` flip and the membership update happen atomically.
 *   When a brand-new member is created, the service also pushes the
 *   organization's default locale onto the new user via
 *   {@link UserSettingsService.update} if the user is still on factory-default
 *   locale settings.
 * - **Failure modes:** `NotFoundError('Membership' | 'Organization' | 'Role' |
 *   'User')` for missing rows; `ForbiddenError('errors:ownerCannotLeave')` (`owner_cannot_leave`)
 *   when the organization owner tries to leave; `ForbiddenError` (`owner_membership_fixed`) for
 *   the owner's status, main role or removal;
 *   `ForbiddenError('errors:onlyOwnerCanTransfer')` for non-owner ownership
 *   transfers;
 *   `ValidationError` on `status` when a PATCH moves a status other than
 *   `active` ↔ `suspended` (T10 — `invited` → `active` only by accepting the invite);
 *   `ValidationError` from Zod-backed validators.
 * - **Side effects:** writes through `MembershipRepository` (insert / update /
 *   soft-delete with `deleted_at`); calls {@link invalidatePermissions} after
 *   every membership mutation that changes effective permissions (create,
 *   update, delete, leave) so the affected user's Redis permission cache is
 *   purged immediately instead of lingering for the cache TTL; updates
 *   {@link UserSettingsService} for locale defaults.
 * - **Notes:** `getPermissions` reads through
 *   {@link MemberRolePermissionService.listPermissionCodesForRole} so role
 *   permissions remain a single source of truth.
 */
export class MembershipService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly memberRoleService: MemberRoleService,
    private readonly memberRolePermissionService: MemberRolePermissionService,
    private readonly membershipRepository: MembershipRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly permissionRepository: PermissionRepository,
    private readonly organizationSettingsService?: OrganizationSettingsService,
    private readonly userSettingsService?: UserSettingsService,
    // reaudit-#7: optional so minimal test harnesses can omit it; the container always wires it.
    private readonly organizationApiKeyRepository?: OrganizationApiKeyRepository,
    // REQ-2: presigns the embedded member `avatar_url`; optional so minimal harnesses can omit it
    // (then the raw stored key is passed through). The container always wires the S3 adapter.
    private readonly objectStorage?: ObjectStoragePort,
    // REQ-1: add-member-by-email provisions/finds the invitee and issues the invitation. Optional so
    // minimal harnesses can omit them; the container always wires both. `create` requires them.
    private readonly userService?: UserService,
    private readonly membershipInvitationService?: MembershipInvitationService,
    // Launch ROUTE #4 (D5): the roles a person holds besides the main one.
    private readonly membershipAdditionalRolesRepository: MembershipAdditionalRolesRepository = new MembershipAdditionalRolesRepository(),
  ) {}

  /** The app domain's branch access (launch ROUTE #4); null in minimal test harnesses. */
  private branchAccess: MembershipBranchAccessPort | null = null;

  /** Late-wires the app domain's branch access; see {@link MembershipBranchAccessPort}. */
  wireBranchAccess(branchAccess: MembershipBranchAccessPort): void {
    this.branchAccess = branchAccess;
  }

  /** The app domain's part of the leave step (launch K4); null in minimal test harnesses. */
  private leaveStep: MembershipLeavePort | null = null;

  /** Late-wires the app domain's part of the leave step; see {@link MembershipLeavePort}. */
  wireLeaveStep(leaveStep: MembershipLeavePort): void {
    this.leaveStep = leaveStep;
  }

  /**
   * The one leave step (launch K4): ends the membership with its reason, revokes the API keys the
   * person created here and lets the app clear what they do now and delete what is theirs alone —
   * the same for a removal, leaving and a deleted account. MUST run inside the organization's
   * database context, so all of it commits or rolls back together.
   *
   * @remarks
   * - **Algorithm:** the guarded soft delete first (it refuses the organization's owner); then the
   *   API keys; then {@link MembershipLeavePort.releaseEndedMembership}; then `membership.deleted`.
   * - **Failure modes:** returns null when the soft delete refused (the owner, or no live row) and
   *   then does nothing else — the caller surfaces the precise error.
   * - **Side effects:** writes `tenancy.memberships`, the organization's API keys and, through the
   *   port, the app's tables; one `membership.deleted` event (webhook fan-out). Permission caches
   *   and the seat sync are the caller's, after commit.
   */
  private async endMembershipInContext(options: {
    organization: SerializingOrganization & { id: number };
    membershipPublicId: string;
    reason: MembershipDeleteReason;
    note: string | null;
  }): Promise<MembershipRow | null> {
    const ended = await this.membershipRepository.softDelete(
      options.membershipPublicId,
      options.organization.id,
      { delete_reason: options.reason, delete_note: options.note },
    );
    if (!ended) return null;
    // reaudit-#7: revoke the departed member's API keys so they lose access too.
    await this.revokeApiKeysForDepartedMember({
      userId: ended.user_id,
      organizationId: options.organization.id,
    });
    await this.leaveStep?.releaseEndedMembership({
      organizationId: options.organization.id,
      membershipId: ended.id,
    });
    await this.emitMembershipEvents({
      type: MEMBERSHIP_EVENT.DELETED,
      memberships: [ended],
      organization: options.organization,
    });
    return ended;
  }

  /**
   * Resolves `role_ids` (main first) to live roles of the organization, in order.
   *
   * @remarks
   * - **Failure modes:** an id that is no live role here is a `ValidationError` on `role_ids`
   *   (400) — the list is the body, not the path.
   */
  private async resolveRoleIds({
    organizationId,
    rolePublicIds,
  }: {
    organizationId: number;
    rolePublicIds: readonly string[];
  }): Promise<ResolvedRole[]> {
    const resolved: ResolvedRole[] = [];
    for (const rolePublicId of rolePublicIds) {
      try {
        resolved.push(
          await this.memberRoleService.requireRoleRecordForOrganization({
            organization_id: organizationId,
            role_public_id: rolePublicId,
          }),
        );
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        throw new ValidationError(
          'errors:validation.membershipRoleNotFound',
          { role_id: rolePublicId },
          undefined,
          [{ field: 'role_ids', messageKey: 'errors:validation.membershipRoleNotFound' }],
        );
      }
    }
    return resolved;
  }

  /**
   * Privilege-escalation guard over every role being assigned: the caller must already hold each
   * permission the roles grant together (access is their union, D5).
   */
  private async assertCallerCanGrantRoles(options: {
    roles: readonly ResolvedRole[];
    callerUserPublicId: string | undefined;
    organizationPublicId: string;
  }): Promise<void> {
    const requestedPermissionCodes = new Set<string>();
    for (const role of options.roles) {
      for (const code of await this.memberRolePermissionService.listPermissionCodesForRole(
        role.id,
      )) {
        requestedPermissionCodes.add(code);
      }
    }
    await assertCallerCanGrantPermissionCodes({
      authorizationService: this.authorizationService,
      permissionRepository: this.permissionRepository,
      callerUserPublicId: options.callerUserPublicId,
      organizationPublicId: options.organizationPublicId,
      requestedPermissionCodes: [...requestedPermissionCodes],
    });
  }

  /**
   * Role ordering for update and delete: the caller must hold every permission the member's live
   * roles (main and additional) grant — see {@link assertCallerHoldsMemberPermissionCodes}.
   */
  private async assertCallerHoldsMemberPermissions(options: {
    organizationPublicId: string;
    membership: MembershipRow;
    callerUserPublicId: string | undefined;
    callerApiKeyScopes: readonly string[] | undefined;
  }): Promise<void> {
    const roleIds = [
      options.membership.role_id,
      ...(await this.membershipAdditionalRolesRepository.listRoleIdsForMembership(
        options.membership.id,
      )),
    ];
    const memberPermissionCodes = new Set<string>();
    for (const roleId of roleIds) {
      for (const code of await this.memberRolePermissionService.listPermissionCodesForRole(
        roleId,
      )) {
        memberPermissionCodes.add(code);
      }
    }
    await assertCallerHoldsMemberPermissionCodes({
      authorizationService: this.authorizationService,
      callerUserPublicId: options.callerUserPublicId,
      callerApiKeyScopes: options.callerApiKeyScopes,
      organizationPublicId: options.organizationPublicId,
      memberPermissionCodes: [...memberPermissionCodes],
    });
  }

  /** The staff profile columns of a create or update body (`commission_percent` as numeric text). */
  private toProfileData(
    parsed: Pick<
      CreateMembershipInput & UpdateMembershipInput,
      'phone' | 'tone' | 'working_days' | 'work_starts_at' | 'work_ends_at' | 'commission_percent'
    >,
  ): MembershipProfileData {
    return omitUndefined({
      phone: parsed.phone,
      tone: parsed.tone,
      working_days: parsed.working_days,
      work_starts_at: parsed.work_starts_at,
      work_ends_at: parsed.work_ends_at,
      commission_percent:
        parsed.commission_percent === undefined ? undefined : parsed.commission_percent.toFixed(2),
    });
  }

  /** Writes the additional roles and, when sent, the branches of a membership just created or edited. */
  private async writeMembershipAccess(options: {
    organizationId: number;
    membershipId: number;
    additionalRoles: readonly ResolvedRole[] | undefined;
    branchPublicIds: readonly string[] | undefined;
    actingUserId: number | null;
  }): Promise<void> {
    if (options.additionalRoles !== undefined) {
      await this.membershipAdditionalRolesRepository.replaceForMembership({
        membership_id: options.membershipId,
        organization_id: options.organizationId,
        role_ids: options.additionalRoles.map((role) => role.id),
        created_by_user_id: options.actingUserId,
      });
    }
    if (options.branchPublicIds !== undefined) {
      if (!this.branchAccess) {
        throw new ConfigurationError(
          'The branch access port must be wired on MembershipService (domain-containers.plugin).',
        );
      }
      await this.branchAccess.replaceBranchesForMembership({
        organizationId: options.organizationId,
        membershipId: options.membershipId,
        branchPublicIds: options.branchPublicIds,
        createdByUserId: options.actingUserId,
      });
    }
  }

  /**
   * REQ-4 seat enforcement + Stripe seat-sync port, late-wired by the composition root.
   *
   * @remarks
   * billing's `SubscriptionService` (which enforces the seat ceiling and enqueues the Stripe
   * quantity sync) itself depends on tenancy for `seats_used`, so the membership↔subscription
   * relationship is a true cycle. It is broken by constructing both services, then setting this
   * field via {@link MembershipService.wireSeatEnforcement} — never a constructor param. Left
   * `null` in minimal test harnesses, where seat enforcement is simply skipped.
   */
  private seatEnforcement: MembershipSeatEnforcementPort | null = null;

  /** Late-wires the billing seat-enforcement port (REQ-4); see {@link seatEnforcement}. */
  wireSeatEnforcement(seatEnforcement: MembershipSeatEnforcementPort): void {
    this.seatEnforcement = seatEnforcement;
  }

  /**
   * Revokes every API key the departing member created in this organization (reaudit-#7), so a
   * removed/left member's keys lose access along with their session. Runs inside the caller's
   * organization DB context (RLS-scoped). Best-effort: skipped when the api-key repository is not
   * wired (minimal test harness).
   */
  private async revokeApiKeysForDepartedMember({
    userId,
    organizationId,
  }: {
    userId: number;
    organizationId: number;
  }): Promise<void> {
    if (!this.organizationApiKeyRepository) return;
    await this.organizationApiKeyRepository.revokeAllByCreatorInOrganization(
      organizationId,
      userId,
    );
  }

  /**
   * Enforces the plan seat limit before a member is added (REQ-4). MUST run inside the organization
   * transaction so the advisory lock (and the billing port's FOR UPDATE, when a subscription
   * exists) serializes concurrent adds. No-op when the seat-enforcement port is unwired (minimal
   * harness) or when the plan grants unlimited seats (`ceiling === null`). Throws
   * `ConflictError('errors:seatLimitReached')` with reason `seat_limit_reached` once
   * `used >= ceiling` (a seat is consumed by ACTIVE + INVITED memberships, so an outstanding invite
   * already counts and a burst of invites cannot overshoot the limit).
   *
   * @remarks
   * audit-#M1: the FOR UPDATE row lock only exists when the organization has an ACTIVE subscription. On the
   * free-tier / no-subscription branch the ceiling is a catalog value with no row to lock, so two
   * concurrent adds could both pass `used < ceiling` and overshoot a plan with `included_seats > 1`.
   * A per-organization advisory xact lock (`MEMBERSHIP_SEAT`) taken up front serializes the count+insert on
   * BOTH paths, independent of whether the free ceiling happens to be 1.
   */
  private async assertSeatAvailableForMemberAdd(organizationInternalId: number): Promise<void> {
    if (!this.seatEnforcement) return;
    // Serialize concurrent member-adds for this organization before the count so the free-tier path (no
    // FOR UPDATE row to lock) cannot race two inserts past the ceiling. Auto-released at COMMIT.
    await acquireResourceQuotaLock({
      namespace: RESOURCE_QUOTA_LOCK_NAMESPACE.MEMBERSHIP_SEAT,
      key: organizationInternalId,
    });
    const seatCeiling =
      await this.seatEnforcement.reserveSeatCeilingForMemberAdd(organizationInternalId);
    if (seatCeiling === null) return;
    const seatsUsed =
      await this.membershipRepository.countActiveByOrganization(organizationInternalId);
    if (seatsUsed >= seatCeiling) {
      throw new ConflictError('errors:seatLimitReached', {
        used: seatsUsed,
        limit: seatCeiling,
      }).withReason('seat_limit_reached');
    }
  }

  /**
   * Best-effort enqueue of a Stripe seat-quantity reconciliation after a member add/remove (REQ-4).
   * Swallows when the port is unwired; the billing port itself swallows enqueue failures so member
   * management never fails on a Redis blip.
   */
  private enqueueSeatQuantitySync(organizationPublicId: string): void {
    if (!this.seatEnforcement) return;
    try {
      this.seatEnforcement.enqueueSeatQuantitySync({
        organization_public_id: organizationPublicId,
      });
    } catch (error) {
      logger.warn({ error, organizationPublicId }, 'membership.seat_sync.enqueue_failed');
    }
  }

  private async invalidatePermissionsForMembership({
    user_internal_id,
    organization_public_id,
  }: {
    user_internal_id: number;
    organization_public_id: string;
  }): Promise<void> {
    const userPublicId =
      await this.organizationService.resolveUserPublicIdByInternalId(user_internal_id);
    if (userPublicId) {
      await invalidatePermissions({ userId: userPublicId, organizationId: organization_public_id });
    }
  }

  /**
   * The same purge for a whole set of members, in one id lookup instead of one per member.
   *
   * @remarks
   * The single-member version above resolves one internal id per call, so running it in a loop
   * costs a round trip per member — and the seat-ceiling path's loop is as long as the number
   * of members being suspended, which a large downgrade makes unbounded. One batch resolve,
   * then the Redis purges together: `invalidatePermissions` swallows its own failures and
   * fails open by design, so no purge can reject the others.
   *
   * An id the resolver does not return has no active user, which is exactly the case the
   * single-member version skips on `null`.
   */
  private async invalidatePermissionsForMemberships({
    user_internal_ids,
    organization_public_id,
  }: {
    user_internal_ids: readonly number[];
    organization_public_id: string;
  }): Promise<void> {
    if (user_internal_ids.length === 0) return;
    const publicIdsByInternalId =
      await this.organizationService.resolveUserPublicIdsByInternalIds(user_internal_ids);
    await Promise.all(
      [...publicIdsByInternalId.values()].map((userPublicId) =>
        invalidatePermissions({ userId: userPublicId, organizationId: organization_public_id }),
      ),
    );
  }

  private async applyOrganizationLocaleDefaults({
    userPublicId,
    organizationPublicId,
  }: {
    userPublicId: string;
    organizationPublicId: string;
  }): Promise<void> {
    if (!(this.organizationSettingsService && this.userSettingsService)) return;
    const currentSettings = await this.userSettingsService.getForInvitedUser(userPublicId);
    if (!isFactoryDefaultUserLocaleSettings(currentSettings)) return;
    const defaultLocale =
      await this.organizationSettingsService.resolveDefaultLocaleForOrganization(
        organizationPublicId,
      );
    await this.userSettingsService.updateForInvitedUser({
      user_public_id: userPublicId,
      body: {
        language: defaultLocale,
        preferred_locales: preferredLocalesForOrganizationDefaultLocale(defaultLocale),
      },
    });
  }

  /**
   * Resolves membership public ids (`mem_…`) of one organization to their internal ids, inside the
   * CALLER's database context — for another domain storing a membership foreign key.
   *
   * @remarks
   * - **Algorithm:** one `IN` lookup over the live memberships of `organizationId`; duplicates in
   *   the input collapse.
   * - **Failure modes:** none raised — an unknown, deleted or foreign id is simply absent from the
   *   map, so the caller decides the error (it knows the field the id came from).
   * - **Side effects:** none; runs on the ambient `withAppDatabaseContext` handle, so call it only
   *   from inside the caller's context.
   */
  async resolveMembershipIdsByPublicIds(options: {
    organizationId: number;
    membershipPublicIds: readonly string[];
  }): Promise<Map<string, number>> {
    const rows = await this.membershipRepository.findIdsByPublicIds(options.organizationId, [
      ...new Set(options.membershipPublicIds),
    ]);
    return new Map(rows.map((row) => [row.public_id, row.id]));
  }

  /**
   * Resolves user summaries, the main role's public id, the extra roles, the branches and (for
   * live `invited` rows) the pending invitation for a page of memberships, and serializes them. The
   * internal `user_id`/`role_id` are never emitted; user summaries go through the SECURITY DEFINER
   * resolver (auth.users is FORCE RLS and unreachable by a plain join under organization-only
   * context), and each distinct avatar key is presigned for read. `is_owner` comes from the
   * organization's `owner_user_id` (launch D81 (4)).
   */
  private async serializeMemberships(options: {
    rows: MembershipRow[];
    organization: SerializingOrganization;
  }): Promise<MembershipOutput[]> {
    const { rows, organization } = options;
    if (rows.length === 0) return [];
    const membershipIds = rows.map((row) => row.id);
    const [userSummaryRows, roleSummaryRows, invitationRows, additionalRoleIds, branchIds] =
      await Promise.all([
        this.membershipRepository.resolveUserSummariesByInternalIds(rows.map((row) => row.user_id)),
        this.membershipRepository.resolveRoleSummariesByInternalIds(rows.map((row) => row.role_id)),
        this.membershipRepository.resolveLiveInvitationsByMembershipIds(
          rows
            .filter((row) => row.status === MEMBERSHIP_STATUS.INVITED && row.deleted_at === null)
            .map((row) => row.id),
        ),
        this.membershipAdditionalRolesRepository.listRolePublicIdsByMembershipIds(membershipIds),
        this.branchAccess
          ? this.branchAccess.listBranchPublicIdsByMembershipIds({ membershipIds })
          : Promise.resolve(new Map<number, string[]>()),
      ]);
    const userSummaries = new Map<number, MembershipUserSummary>();
    for (const [userInternalId, row] of userSummaryRows) {
      userSummaries.set(userInternalId, {
        id: row.public_id,
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        // Presign the raw avatar key for read (network-free signature); pass through when no
        // object-storage adapter is wired (minimal test harness).
        avatar_url: this.objectStorage
          ? await resolveStoredMediaReadUrl({
              objectStorage: this.objectStorage,
              storedValue: row.avatar_url,
            })
          : row.avatar_url,
      });
    }
    return rows.map((row) => {
      const user: MembershipUserSummary = userSummaries.get(row.user_id) ?? {
        id: String(row.user_id),
        email: '',
        first_name: null,
        last_name: null,
        avatar_url: null,
      };
      const mainRolePublicId = roleSummaryRows.get(row.role_id)?.public_id ?? String(row.role_id);
      const access: MembershipAccessRefs = {
        role_ids: [mainRolePublicId, ...(additionalRoleIds.get(row.id) ?? [])],
        branch_ids: branchIds.get(row.id) ?? [],
      };
      return serializeMembership({
        row,
        organization_public_id: organization.public_id,
        user,
        invitation: invitationRows.get(row.id) ?? null,
        access,
        is_owner: row.user_id === organization.owner_user_id,
      });
    });
  }

  private async resolveAndSerializeMembership(options: {
    membership: MembershipRow;
    organization: SerializingOrganization;
  }): Promise<MembershipOutput> {
    const [output] = await this.serializeMemberships({
      rows: [options.membership],
      organization: options.organization,
    });
    return output!;
  }

  /**
   * Emits a membership resource event per row, each with the membership's public JSON.
   *
   * @remarks
   * - **Algorithm:** serializes the rows in one batch ({@link serializeMemberships}), then emits
   *   one {@link MEMBERSHIP_EVENT} per membership.
   * - **Failure modes:** a serialization read failure propagates (it runs in the caller's
   *   transaction); handler failures are swallowed by the bus.
   * - **Side effects:** the notify handler records PENDING webhook delivery attempts.
   * - **Notes:** call it inside the write's organization database context, so the fan-out joins its
   *   transaction. Public because {@link MembershipInvitationService} (accept) changes memberships
   *   too and emits through it.
   */
  async emitMembershipEvents(options: {
    type: MembershipEventType;
    memberships: MembershipRow[];
    organization: SerializingOrganization;
  }): Promise<MembershipOutput[]> {
    const outputs = await this.serializeMemberships({
      rows: options.memberships,
      organization: options.organization,
    });
    for (const output of outputs) {
      await eventBus.emit(
        buildDomainEvent<OrganizationResourceEventPayload>({
          type: options.type,
          payload: {
            organization_public_id: options.organization.public_id,
            data: { ...output },
          },
        }),
      );
    }
    return outputs;
  }

  /**
   * Turns a role and a branch named by public id into the list filters; `null` when either is not
   * of this organization — the list is then empty, never a 400 (a filter, not a write).
   */
  private async resolveListFilters(options: {
    organizationId: number;
    rolePublicId: string | undefined;
    branchPublicId: string | undefined;
  }): Promise<Pick<MembershipListQuery, 'roleId' | 'membershipIds'> | null> {
    const filters: Pick<MembershipListQuery, 'roleId' | 'membershipIds'> = {};
    if (options.rolePublicId !== undefined) {
      try {
        const role = await this.memberRoleService.requireRoleRecordForOrganization({
          organization_id: options.organizationId,
          role_public_id: options.rolePublicId,
        });
        filters.roleId = role.id;
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    }
    if (options.branchPublicId !== undefined) {
      const membershipIds = this.branchAccess
        ? await this.branchAccess.listMembershipIdsAtBranch({
            organizationId: options.organizationId,
            branchPublicId: options.branchPublicId,
          })
        : null;
      if (membershipIds === null) return null;
      filters.membershipIds = membershipIds;
    }
    return filters;
  }

  /**
   * The team list (launch §2.B route 2): every status, filtered by `status`, `role_id`,
   * `branch_id` (T2) and `q`; ended members with `include_ended=true` (D58); the capped total on
   * the first page.
   */
  async list({ scope, query }: { scope: OrganizationPrincipalDatabaseScope; query: unknown }) {
    const organization_public_id = scope.organizationPublicId;
    const parsed = validateListMembershipsQuery(query);
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        const filters = await this.resolveListFilters({
          organizationId: organization.id,
          rolePublicId: parsed.role_id,
          branchPublicId: parsed.branch_id,
        });
        if (filters === null) {
          return { items: [], total: 0, limit: parsed.limit, has_more: false, next_cursor: null };
        }
        const result = await this.membershipRepository.list(organization.id, {
          ...filters,
          after: parsed.after,
          limit: parsed.limit,
          q: parsed.q,
          sort: parsed.sort,
          order: parsed.order,
          statuses: parsed.status === undefined ? undefined : [parsed.status],
          includeEnded: parsed.include_ended === 'true',
          withTotal: true,
        });
        return {
          ...result,
          // Batch-resolve user + role summaries + live invitations for the page (no N+1).
          items: await this.serializeMemberships({ rows: result.items, organization }),
        };
      },
    });
  }

  /**
   * The member directory behind the app's team picker (launch §2.A route 1, K5): live active
   * members by name; with `includeEnded`, every membership of the organization — any status, live
   * or ended — so an id a record holds always resolves to a name.
   *
   * @remarks
   * - **Algorithm:** the same keyset list as {@link MembershipService.list}, sorted by
   *   `display_name`; an unknown role or branch is an empty page; `holdsPermissionCode` keeps the
   *   members one of whose live roles grants it (T8 — e.g. who can be given a task).
   * - **Failure modes:** none beyond the query.
   */
  async listDirectory({
    scope,
    query,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    query: MembershipDirectoryQuery;
  }) {
    const organization_public_id = scope.organizationPublicId;
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        const filters = await this.resolveListFilters({
          organizationId: organization.id,
          rolePublicId: query.rolePublicId,
          branchPublicId: query.branchPublicId,
        });
        if (filters === null) {
          return { items: [], total: null, limit: query.limit, has_more: false, next_cursor: null };
        }
        const result = await this.membershipRepository.list(organization.id, {
          ...filters,
          after: query.after,
          limit: query.limit,
          q: query.q,
          sort: 'name',
          order: 'asc',
          publicIds: query.publicIds,
          holdsPermissionCode: query.holdsPermissionCode,
          statuses: query.includeEnded ? undefined : [MEMBERSHIP_STATUS.ACTIVE],
          includeEnded: query.includeEnded,
        });
        return {
          ...result,
          items: await this.serializeMemberships({ rows: result.items, organization }),
        };
      },
    });
  }

  /** One member, live or ended (launch D58); 404 when not of this organization. */
  async getByPublicId({
    scope,
    membership_public_id,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    membership_public_id: string;
  }): Promise<MembershipOutput> {
    const organization_public_id = scope.organizationPublicId;
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        const membership = await this.membershipRepository.findAnyByPublicId(
          membership_public_id,
          organization.id,
        );
        if (!membership) throw new NotFoundError('Membership');
        return this.resolveAndSerializeMembership({ membership, organization });
      },
    });
  }

  async create({
    scope,
    body,
    invited_by_user_public_id,
    options,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
    invited_by_user_public_id: string | undefined;
    options?: { requestId?: string } | undefined;
  }): Promise<MembershipOutput> {
    const organization_public_id = scope.organizationPublicId;
    const parsed = validateCreateMembership(body);
    const userService = this.userService;
    const membershipInvitationService = this.membershipInvitationService;
    if (!(userService && membershipInvitationService)) {
      throw new ConfigurationError(
        'UserService and MembershipInvitationService must be wired on MembershipService (tenancy.container).',
      );
    }
    // Block disposable invitee addresses up front (no DB/context needed) — mirrors the prior
    // invitation-create guard now that the email enters at the membership door.
    if (isDisposableEmailBlocked(parsed.email)) {
      throw new ValidationError('errors:disposableEmail', undefined, undefined, [
        { field: 'email', messageKey: 'errors:disposableEmail' },
      ]).withReason('disposable_email');
    }
    // Provision/find the invitee in its OWN transaction (BEFORE the organization context) so the public-id
    // collision retry can open fresh transactions — a pinned organization transaction would abort on retry.
    // A user left with no membership by a later failure is harmless and reused on the next attempt.
    const inviteeUser = await userService.findOrCreateInvitedByEmail({
      email: parsed.email,
    });
    const result = await withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        // Capability matrix: a PERSONAL organization is single-member by definition. Collaboration
        // requires a TEAM organization — reject here so the single-member invariant holds at every door.
        assertTeamOrganization({ organization, capability: 'MEMBERS' });
        // `role_ids`, main first (D5): the main role is the membership's `role_id`, the rest are
        // its additional roles.
        const roles = await this.resolveRoleIds({
          organizationId: organization.id,
          rolePublicIds: parsed.role_ids,
        });
        const [role, ...additionalRoles] = roles;
        if (!role) throw new ValidationError('errors:invalidInput');
        // Privilege-escalation guard: the caller must already hold every permission the assigned roles
        // would grant, or a MEMBERSHIP_CREATE holder could mint an Admin membership for a throwaway
        // address and accept it → full organization takeover. Runs BEFORE any row is persisted.
        await this.assertCallerCanGrantRoles({
          roles,
          callerUserPublicId: invited_by_user_public_id,
          organizationPublicId: organization_public_id,
        });
        // REQ-4: enforce the plan seat limit before persisting the new membership. Runs INSIDE the
        // existing organization transaction so the per-organization advisory lock (plus the FOR UPDATE row lock when a
        // subscription exists) serializes concurrent adds — two simultaneous adds cannot both pass the
        // same count and exceed the limit, on the paid OR the free-tier path (audit-#M1). Ceiling of
        // null (unlimited plan / unwired port) is a no-op.
        await this.assertSeatAvailableForMemberAdd(organization.id);
        const inviterId =
          await this.organizationService.resolveUserInternalIdByPublicId(invited_by_user_public_id);
        if (inviterId === null) throw new NotFoundError('User');
        let created: MembershipRow;
        try {
          // K7 / KC6: the same login added again gets its ended membership back — same id, staff
          // number and history, invited again — instead of a new row. A different login is always a
          // new member (an email can pass to another person).
          const ended = await this.membershipRepository.findLatestEndedForUser({
            userId: inviteeUser.id,
            organizationId: organization.id,
          });
          const revived = ended
            ? await this.membershipRepository.reviveAsInvited({
                id: ended.id,
                organizationId: organization.id,
                roleId: role.id,
                invitedByUserId: inviterId,
                profile: this.toProfileData(parsed),
              })
            : null;
          created =
            revived ??
            (await this.membershipRepository.create({
              organization_id: organization.id,
              user_id: inviteeUser.id,
              role_id: role.id,
              status: MEMBERSHIP_STATUS.INVITED,
              invited_by_user_id: inviterId,
              created_by_user_id: inviterId,
              profile: this.toProfileData(parsed),
            }));
        } catch (error) {
          // The invitee already belongs to this organization (idx_memberships_user_org_unique) —
          // surface a clean 409 instead of an unhandled unique_violation 500. Covers an existing
          // active member and a still-live invited one (the FE resends in that case).
          if (isPostgresUniqueViolation(error)) {
            throw new ConflictError('errors:membershipAlreadyExists').withReason(
              'membership_already_exists',
            );
          }
          throw error;
        }
        await this.writeMembershipAccess({
          organizationId: organization.id,
          membershipId: created.id,
          additionalRoles,
          branchPublicIds: parsed.branch_ids,
          actingUserId: inviterId,
        });
        // Issue the invitation (token + email) in this same organization transaction.
        const issuedInvitation = await membershipInvitationService.createForMembership({
          organization_name: organization.name ?? organization.public_id,
          organization_id: organization.id,
          membership_id: created.id,
          membership_public_id: created.public_id,
          email: inviteeUser.email,
          expires_in_days: parsed.expires_in_days,
          invited_by_user_id: inviterId,
          organization_public_id,
          ...(options?.requestId !== undefined ? { requestId: options.requestId } : {}),
        });
        await this.applyOrganizationLocaleDefaults({
          userPublicId: inviteeUser.public_id,
          organizationPublicId: organization_public_id,
        });
        const [output] = await this.emitMembershipEvents({
          type: MEMBERSHIP_EVENT.CREATED,
          memberships: [created],
          organization,
        });
        // ROUTE #164: the dev-only accept-token echo rides on the embedded invitation (flag off → none).
        return attachInvitationTokenEcho({ membership: output!, issued: issuedInvitation });
      },
    });
    // sec-R11: invalidate the invitee's cached permissions AFTER the organization transaction commits.
    // Doing it pre-commit left a race where a concurrent recompute re-cached the stale set.
    await invalidatePermissions({
      userId: inviteeUser.public_id,
      organizationId: organization_public_id,
    });
    // REQ-4: the seat count just grew — reconcile the Stripe subscription quantity out-of-band.
    // Enqueued AFTER the organization transaction commits so the worker re-reads the new count. Best-effort.
    this.enqueueSeatQuantitySync(organization_public_id);
    return result;
  }

  /**
   * Changes a member (launch §2.B route 5): a live member's status (`active` ↔ `suspended`, T10),
   * roles and staff profile; an ended member's `display_name` only (K6, D58).
   *
   * @remarks
   * - **Algorithm:** inside the organization context — the member (live or ended, 404 otherwise);
   *   `expected_updated_at` (T14); an ended member → rename; a live one → the owner guard (status;
   *   the owner may hold extra roles, but their main role stays first — D81 (4)), the status move,
   *   the seat check on reactivation, the role grant guard, then the write and the access lists.
   *   After commit: the permission cache and, when a seat changed, the Stripe quantity.
   * - **Failure modes:** `NotFoundError('Membership')`; `ValidationError` on `display_name` (a live
   *   member's name follows the profile), `membership_ended` (anything but a rename on an ended
   *   member), `status` (a move other than `active` ↔ `suspended`), `work_ends_at`, `role_ids`,
   *   `branch_ids`; `ForbiddenError` (`owner_membership_fixed`) for the owner's status or main role
   *   and for a code the caller does not hold; `ConflictError` `record_changed` and
   *   `seat_limit_reached`.
   */
  async update({
    scope,
    membership_public_id,
    body,
    updated_by_user_public_id,
    options,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    membership_public_id: string;
    body: unknown;
    updated_by_user_public_id: string | undefined;
    options?: MembershipActionOptions | undefined;
  }): Promise<MembershipOutput> {
    const organization_public_id = scope.organizationPublicId;
    const parsed = validateUpdateMembership(body);
    let affectedUserInternalId: number | undefined;
    let seatUsageChanged = false;
    const result = await withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        const membership = await this.membershipRepository.findAnyByPublicId(
          membership_public_id,
          organization.id,
        );
        if (!membership) throw new NotFoundError('Membership');
        // T14 / D43: a save based on an older version is refused with who and when.
        await assertRecordNotChangedSince({
          row: membership,
          expected: parsed.expected_updated_at,
          resolveUserPublicId: (userInternalId) =>
            this.organizationService.resolveUserPublicIdByInternalId(userInternalId),
        });
        const userId =
          await this.organizationService.resolveUserInternalIdByPublicId(updated_by_user_public_id);
        if (membership.deleted_at !== null) {
          return this.renameEndedMembership({
            membership,
            parsed,
            organization,
            updatedByUserId: userId ?? null,
          });
        }
        assertLiveMembershipEdit({ parsed, membership, ownerUserId: organization.owner_user_id });
        // The roles asked for, main first (D5). The owner's main role is fixed whoever asks (D81 (4)),
        // so that refusal comes before role ordering and names the owner, not the caller's codes.
        const roles =
          parsed.role_ids === undefined
            ? undefined
            : await this.resolveRoleIds({
                organizationId: organization.id,
                rolePublicIds: parsed.role_ids,
              });
        if (roles !== undefined) {
          assertOwnerKeepsMainRole({
            membership,
            ownerUserId: organization.owner_user_id,
            mainRoleId: roles[0]?.id,
          });
        }
        // Role ordering: only a caller holding every permission of the member's roles changes them.
        await this.assertCallerHoldsMemberPermissions({
          organizationPublicId: organization_public_id,
          membership,
          callerUserPublicId: updated_by_user_public_id,
          callerApiKeyScopes: options?.callerApiKeyScopes,
        });
        /**
         * F1: reactivating a suspended member re-consumes a seat — suspended memberships are NOT
         * counted toward the cap, so a `suspended -> active` transition adds one to the live seat
         * count. Without this check, suspend → add-a-new-member-into-the-freed-slot → reactivate
         * overshoots the plan's seat ceiling unbounded. Run the same seat-availability check as
         * `create`, inside this organization transaction so the subscription `FOR UPDATE` lock serializes it.
         */
        if (
          parsed.status === MEMBERSHIP_STATUS.ACTIVE &&
          membership.status !== MEMBERSHIP_STATUS.ACTIVE
        ) {
          await this.assertSeatAvailableForMemberAdd(organization.id);
        }
        let roleInternalId: number | undefined;
        let additionalRoles: ResolvedRole[] | undefined;
        if (roles !== undefined) {
          // REQ-3: the same privilege-escalation guard as create — a caller must already hold every
          // permission the roles grant together, so a MEMBERSHIP_UPDATE holder cannot escalate a
          // member past their own access.
          await this.assertCallerCanGrantRoles({
            roles,
            callerUserPublicId: updated_by_user_public_id,
            organizationPublicId: organization_public_id,
          });
          const [mainRole, ...rest] = roles;
          roleInternalId = mainRole?.id;
          additionalRoles = rest;
        }
        const updated = await this.membershipRepository.update(
          membership_public_id,
          organization.id,
          omitUndefined({
            status: parsed.status,
            role_id: roleInternalId,
            profile: this.toProfileData(parsed),
          }),
          userId ?? null,
        );
        if (!updated) throw new NotFoundError('Membership');
        await this.writeMembershipAccess({
          organizationId: organization.id,
          membershipId: updated.id,
          additionalRoles,
          branchPublicIds: parsed.branch_ids,
          actingUserId: userId ?? null,
        });
        affectedUserInternalId = updated.user_id;
        // REQ-4: suspended does not occupy a seat, so crossing that line in either direction moves
        // `seats_used` and has to reach Stripe. A role-only PATCH, or a status change that stays on
        // the same side of the line, leaves the count alone and must NOT enqueue a job.
        seatUsageChanged =
          membershipStatusConsumesSeat(membership.status) !==
          membershipStatusConsumesSeat(updated.status);
        const [output] = await this.emitMembershipEvents({
          type: MEMBERSHIP_EVENT.UPDATED,
          memberships: [updated],
          organization,
        });
        return output!;
      },
    });
    // sec-R11: invalidate AFTER commit so a racing recompute can't re-cache the stale role set.
    if (affectedUserInternalId !== undefined) {
      await this.invalidatePermissionsForMembership({
        user_internal_id: affectedUserInternalId,
        organization_public_id,
      });
    }
    // REQ-4: suspending a member frees a seat and reactivating one takes it back, exactly like the
    // add/remove paths below — enqueued after the commit so the worker re-reads the settled count.
    if (seatUsageChanged) {
      this.enqueueSeatQuantitySync(organization_public_id);
    }
    return result;
  }

  /**
   * K6 / D58: an ended membership accepts one change — its name (e.g. "Former member"), so a former
   * member can disappear from the organization's records. Anything else is a 400.
   */
  private async renameEndedMembership(options: {
    membership: MembershipRow;
    parsed: UpdateMembershipInput;
    organization: SerializingOrganization;
    updatedByUserId: number | null;
  }): Promise<MembershipOutput> {
    const otherFields = Object.keys(options.parsed).filter(
      (field) => field !== 'display_name' && field !== 'expected_updated_at',
    );
    const displayName = options.parsed.display_name;
    if (otherFields.length > 0 || displayName === undefined) {
      const fields = otherFields.length > 0 ? otherFields : ['display_name'];
      throw new ValidationError(
        'errors:validation.membershipEnded',
        undefined,
        undefined,
        fields.map((field) => ({ field, messageKey: 'errors:validation.membershipEnded' })),
      ).withReason('membership_ended');
    }
    const renamed = await this.membershipRepository.renameEnded({
      publicId: options.membership.public_id,
      organizationId: options.membership.organization_id,
      displayName,
      updatedByUserId: options.updatedByUserId,
    });
    if (!renamed) throw new NotFoundError('Membership');
    return this.resolveAndSerializeMembership({
      membership: renamed,
      organization: options.organization,
    });
  }

  async delete({
    scope,
    membership_public_id,
    query,
    options,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    membership_public_id: string;
    query: unknown;
    options?: MembershipActionOptions | undefined;
  }): Promise<void> {
    const organization_public_id = scope.organizationPublicId;
    // RC-143: a manager's removal carries why (and a note for `other`).
    const removal = validateDeleteMembershipQuery(query);
    let affectedUserInternalId: number | undefined;
    await withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        const membership = await this.membershipRepository.findByPublicId(
          membership_public_id,
          organization.id,
        );
        if (!membership) throw new NotFoundError('Membership');
        // The owner cannot be removed — they must transfer ownership first, or the organization
        // would be left without an owner.
        if (organization.owner_user_id === membership.user_id) {
          throw ownerMembershipFixedError('errors:ownerCannotBeRemoved');
        }
        await this.assertCallerHoldsMemberPermissions({
          organizationPublicId: organization_public_id,
          membership,
          callerUserPublicId: scope.userPublicId,
          callerApiKeyScopes: options?.callerApiKeyScopes,
        });
        const deleted = await this.endMembershipInContext({
          organization,
          membershipPublicId: membership_public_id,
          reason: removal.reason,
          note: removal.note ?? null,
        });
        if (!deleted) {
          // The atomic owner-guard refused the delete (a concurrent transfer made this member the
          // owner after the check above) or the row vanished — re-resolve for the precise error.
          const current =
            await this.organizationService.requireOrganizationRecordByPublicId(
              organization_public_id,
            );
          if (current.owner_user_id === membership.user_id) {
            throw ownerMembershipFixedError('errors:ownerCannotBeRemoved');
          }
          throw new NotFoundError('Membership');
        }
        affectedUserInternalId = deleted.user_id;
      },
    });
    // sec-R11: invalidate AFTER commit so a racing recompute can't re-cache the removed member's
    // stale permissions (delayed revocation).
    if (affectedUserInternalId !== undefined) {
      await this.invalidatePermissionsForMembership({
        user_internal_id: affectedUserInternalId,
        organization_public_id,
      });
    }
    // REQ-4: the seat count just shrank — reconcile the Stripe subscription quantity out-of-band.
    this.enqueueSeatQuantitySync(organization_public_id);
  }

  async getPermissions({
    scope,
    membership_public_id,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    membership_public_id: string;
  }): Promise<MembershipPermissionsOutput> {
    const organization_public_id = scope.organizationPublicId;
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        const membership = await this.membershipRepository.findByPublicId(
          membership_public_id,
          organization.id,
        );
        if (!membership) throw new NotFoundError('Membership');
        // The union across the main role and the additional ones (D5).
        const roleIds = [
          membership.role_id,
          ...(await this.membershipAdditionalRolesRepository.listRoleIdsForMembership(
            membership.id,
          )),
        ];
        const permissionCodes = new Set<string>();
        for (const roleId of roleIds) {
          for (const code of await this.memberRolePermissionService.listPermissionCodesForRole(
            roleId,
          )) {
            permissionCodes.add(code);
          }
        }
        return { permission_codes: [...permissionCodes] };
      },
    });
  }

  /**
   * Undoes a member's removal (RC-144 — the 10-second undo, and later within the purge window).
   *
   * @remarks
   * - **Algorithm:** inside the organization context, find the soft-deleted membership (404 when
   *   none; 409 when it is live), re-check the plan's seat limit when the row takes a seat, clear
   *   `deleted_at` and the removal reason; after commit, drop the person's cached permissions and
   *   reconcile the seat count.
   * - **Failure modes:** `NotFoundError('Membership')`; `ConflictError` (`membership_not_deleted`)
   *   for a live row, (`membership_already_exists`) when the person already has a live membership
   *   again, (`seat_limit_reached`) when no seat is free.
   * - **Notes:** the API keys revoked at removal stay revoked.
   */
  async restore({
    scope,
    membership_public_id,
    restored_by_user_public_id,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    membership_public_id: string;
    restored_by_user_public_id: string | undefined;
  }): Promise<MembershipOutput> {
    const organization_public_id = scope.organizationPublicId;
    let restoredUserInternalId: number | undefined;
    let seatTaken = false;
    const result = await withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        const deleted = await this.membershipRepository.findDeletedByPublicId(
          membership_public_id,
          organization.id,
        );
        if (!deleted) {
          const live = await this.membershipRepository.findByPublicId(
            membership_public_id,
            organization.id,
          );
          if (live) {
            throw new ConflictError('errors:membershipNotDeleted').withReason(
              'membership_not_deleted',
            );
          }
          throw new NotFoundError('Membership');
        }
        seatTaken = membershipStatusConsumesSeat(deleted.status);
        if (seatTaken) await this.assertSeatAvailableForMemberAdd(organization.id);
        const userId = await this.organizationService.resolveUserInternalIdByPublicId(
          restored_by_user_public_id,
        );
        let restored: MembershipRow | null;
        try {
          restored = await this.membershipRepository.restore(
            membership_public_id,
            organization.id,
            userId ?? null,
          );
        } catch (error) {
          if (isPostgresUniqueViolation(error)) {
            throw new ConflictError('errors:membershipAlreadyExists').withReason(
              'membership_already_exists',
            );
          }
          throw error;
        }
        if (!restored) throw new NotFoundError('Membership');
        restoredUserInternalId = restored.user_id;
        return this.resolveAndSerializeMembership({ membership: restored, organization });
      },
    });
    if (restoredUserInternalId !== undefined) {
      await this.invalidatePermissionsForMembership({
        user_internal_id: restoredUserInternalId,
        organization_public_id,
      });
    }
    if (seatTaken) this.enqueueSeatQuantitySync(organization_public_id);
    return result;
  }

  /**
   * Revokes an invited member's pending invite (launch §2.C route 9): the invite is revoked and the
   * invited membership ends (`not_needed`) through the one leave step, in one transaction.
   *
   * @remarks
   * - **Algorithm:** inside the organization context — the live `invited` member, its pending
   *   invitation (revoked), then {@link MembershipService.endMembershipInContext}. After commit: the
   *   permission cache and the seat sync (an invited member holds a seat).
   * - **Failure modes:** `NotFoundError('Membership invitation')` when there is no pending invite —
   *   accepted, revoked, or the member removed.
   * - **Side effects:** writes `tenancy.membership_invitations`, `tenancy.memberships` and, through
   *   the leave step, the app's tables.
   */
  async revokeInvitation({
    scope,
    membership_public_id,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    membership_public_id: string;
  }): Promise<void> {
    const organization_public_id = scope.organizationPublicId;
    const invitationService = this.requireInvitationService();
    let affectedUserInternalId: number | undefined;
    await withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        const membership = await this.membershipRepository.findByPublicId(
          membership_public_id,
          organization.id,
        );
        if (membership?.status !== MEMBERSHIP_STATUS.INVITED) {
          throw new NotFoundError('Membership invitation');
        }
        const revoked = await invitationService.revokePendingForMembership(membership.id);
        if (!revoked) throw new NotFoundError('Membership invitation');
        const ended = await this.endMembershipInContext({
          organization,
          membershipPublicId: membership_public_id,
          reason: MEMBERSHIP_DELETE_REASON.NOT_NEEDED,
          note: null,
        });
        if (!ended) throw new NotFoundError('Membership invitation');
        affectedUserInternalId = ended.user_id;
      },
    });
    if (affectedUserInternalId !== undefined) {
      await this.invalidatePermissionsForMembership({
        user_internal_id: affectedUserInternalId,
        organization_public_id,
      });
    }
    // REQ-4: an invited membership holds a seat, so revoking the invite frees one.
    this.enqueueSeatQuantitySync(organization_public_id);
  }

  /**
   * The invitee turns down an invitation (launch D84 (3), ROUTE #174): the invite is revoked, the
   * invited membership ends (`declined`) through the one leave step, and the inviter is told — in
   * one transaction in the inviting organization.
   *
   * @remarks
   * - **Algorithm:** the verified invitee and the invitation's organization (the SECURITY DEFINER
   *   lookup — the invitee is no member there); inside that organization's context the invitation
   *   is revoked for the invitee's email, the still-`invited` membership ended, and the decline
   *   notice emitted. After commit: the permission cache and the seat sync (an invited member
   *   holds a seat).
   * - **Failure modes:** `NotFoundError` (no invitation, or its membership or organization gone);
   *   `ForbiddenError` (`invitationRequiresVerifiedEmail`, `invitationEmailMismatch`);
   *   `ValidationError` `invitation_revoked` / `invitation_already_accepted`.
   * - **Side effects:** writes `tenancy.membership_invitations`, `tenancy.memberships` and, through
   *   the leave step, the app's tables; one in-app notification.
   * - **Notes:** an expired invitation can be declined too — it frees the seat at once.
   */
  async declineInvitation(options: {
    invitationPublicId: string;
    actingUserPublicId: string;
  }): Promise<MembershipInvitationOutput & { organization_id: string }> {
    const invitationService = this.requireInvitationService();
    const { invitee, lookup } = await invitationService.resolveInviteeAndOrganization({
      invitation_public_id: options.invitationPublicId,
      actingUserPublicId: options.actingUserPublicId,
    });
    let affectedUserInternalId: number | undefined;
    const revoked = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: lookup.organization_public_id }),
      callback: async () => {
        const invitation = await invitationService.revokeForInvitee({
          invitation_public_id: options.invitationPublicId,
          inviteeEmail: invitee.email,
        });
        const organization = await this.organizationService.requireOrganizationRecordByPublicId(
          lookup.organization_public_id,
        );
        const ended = await this.endInvitedMembershipInContext({
          organization,
          membershipPublicId: lookup.membership_public_id,
          reason: MEMBERSHIP_DELETE_REASON.DECLINED,
        });
        if (!ended) throw new NotFoundError('Membership invitation');
        affectedUserInternalId = ended.user_id;
        await invitationService.notifyDeclined({
          invitation,
          organizationId: lookup.organization_id,
          organizationPublicId: lookup.organization_public_id,
          inviteeUserId: ended.user_id,
          inviteeName:
            [invitee.first_name, invitee.last_name].filter(Boolean).join(' ').trim() ||
            invitee.email,
        });
        return invitation;
      },
    });
    if (affectedUserInternalId !== undefined) {
      await this.invalidatePermissionsForMembership({
        user_internal_id: affectedUserInternalId,
        organization_public_id: lookup.organization_public_id,
      });
    }
    this.enqueueSeatQuantitySync(lookup.organization_public_id);
    return {
      ...serializeMembershipInvitation({
        row: revoked,
        membership_public_id: lookup.membership_public_id,
      }),
      organization_id: lookup.organization_public_id,
    };
  }

  /**
   * Ends an invited membership whose invitation expired before `expiredBefore` (launch D84 (4),
   * ROUTE #175) — the expiry sweep's step for one membership: the invite is revoked and the
   * membership ends (`invitation_expired`) through the one leave step, freeing its seat.
   *
   * @remarks
   * - **Algorithm:** inside the organization's context (ids the sweep's own scan proved): the
   *   still-`invited` membership, its latest invitation revoked only while open and that long
   *   expired, then the leave step. After commit: the permission cache and the seat sync.
   * - **Failure modes:** none of its own — anything no longer due (accepted, revoked, resent,
   *   removed) is a `false` skip, so the sweep is safe to run twice.
   * - **Side effects:** as {@link MembershipService.declineInvitation}, without a notice.
   */
  async endExpiredInvitation(options: {
    organizationPublicId: string;
    membershipPublicId: string;
    expiredBefore: Date;
  }): Promise<boolean> {
    const invitationService = this.requireInvitationService();
    const ended = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: options.organizationPublicId }),
      callback: async () => {
        const found = await this.organizationService.findOrganizationByPublicId(
          options.organizationPublicId,
        );
        if (!found) return null;
        const organization = await this.organizationService.requireOrganizationRecordByPublicId(
          options.organizationPublicId,
        );
        const membership = await this.membershipRepository.findByPublicId(
          options.membershipPublicId,
          organization.id,
        );
        if (membership?.status !== MEMBERSHIP_STATUS.INVITED) return null;
        const revoked = await invitationService.revokeExpiredForMembership({
          membership_id: membership.id,
          expiredBefore: options.expiredBefore,
        });
        if (!revoked) return null;
        return this.endInvitedMembershipInContext({
          organization,
          membershipPublicId: options.membershipPublicId,
          reason: MEMBERSHIP_DELETE_REASON.INVITATION_EXPIRED,
        });
      },
    });
    if (!ended) return false;
    await this.invalidatePermissionsForMembership({
      user_internal_id: ended.user_id,
      organization_public_id: options.organizationPublicId,
    });
    this.enqueueSeatQuantitySync(options.organizationPublicId);
    return true;
  }

  /** The wired invitation service; a {@link ConfigurationError} in a harness that left it out. */
  private requireInvitationService(): MembershipInvitationService {
    if (!this.membershipInvitationService) {
      throw new ConfigurationError(
        'MembershipInvitationService must be wired on MembershipService (tenancy.container).',
      );
    }
    return this.membershipInvitationService;
  }

  /**
   * Ends a membership that is still `invited` through the one leave step — the invitee declined
   * or the invite expired (launch D84). `null` when it is no longer invited (accepted meanwhile,
   * or already ended). MUST run inside the organization context.
   */
  private async endInvitedMembershipInContext(options: {
    organization: SerializingOrganization & { id: number };
    membershipPublicId: string;
    reason: MembershipDeleteReason;
  }): Promise<MembershipRow | null> {
    const membership = await this.membershipRepository.findByPublicId(
      options.membershipPublicId,
      options.organization.id,
    );
    if (membership?.status !== MEMBERSHIP_STATUS.INVITED) return null;
    return this.endMembershipInContext({
      organization: options.organization,
      membershipPublicId: options.membershipPublicId,
      reason: options.reason,
      note: null,
    });
  }

  /**
   * The caller's membership in their active organization — its public id and every live role it
   * holds, the main role first (D5), each with its name, tone and system flag — for
   * `GET /auth/me/context` (`membership_id`, `my_role_ids`, `my_roles`; launch ROUTE #156, N10, S3).
   * `null` with no active organization or no live membership.
   *
   * @remarks
   * - **Algorithm:** one user-and-organization context: the caller's live membership, its
   *   additional roles' ids in `position` order, then one read naming the live roles — a deleted
   *   role drops out of the list.
   * - **Failure modes:** none beyond the queries; an unknown organization reads as no membership.
   */
  async getCallerMembershipContext(
    scope: UserPrincipalDatabaseScope,
  ): Promise<CallerMembershipContext | null> {
    const organizationPublicId = scope.organizationPublicId;
    if (!organizationPublicId) return null;
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization = await this.organizationService
          .requireOrganizationRecordByPublicId(organizationPublicId)
          .catch((error: unknown) => {
            if (error instanceof NotFoundError) return null;
            throw error;
          });
        const userId = await this.organizationService.resolveUserInternalIdByPublicId(
          scope.userPublicId,
        );
        if (!organization || userId === null) return null;
        const membership = await this.membershipRepository.findByUserAndOrganization(
          userId,
          organization.id,
        );
        if (!membership) return null;
        const roleIds = [
          membership.role_id,
          ...(await this.membershipAdditionalRolesRepository.listRoleIdsForMembership(
            membership.id,
          )),
        ];
        const summaries =
          await this.membershipRepository.resolveRoleSummariesByInternalIds(roleIds);
        return {
          membership_id: membership.public_id,
          roles: roleIds.flatMap((roleId) => {
            const summary = summaries.get(roleId);
            return summary
              ? [
                  {
                    id: summary.public_id,
                    name: summary.name,
                    tone: summary.tone,
                    is_system: summary.is_system,
                  },
                ]
              : [];
          }),
        };
      },
    });
  }

  async leaveOrganization({
    scope,
    user_public_id,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    user_public_id: string;
  }): Promise<void> {
    const organization_public_id = scope.organizationPublicId;
    await withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        const userId =
          await this.organizationService.resolveUserInternalIdByPublicId(user_public_id);
        if (userId === null) throw new NotFoundError('User');
        const membership = await this.membershipRepository.findByUserAndOrganization(
          userId,
          organization.id,
        );
        if (!membership) throw new NotFoundError('Membership');
        if (organization.owner_user_id === userId) {
          throw new ForbiddenError('errors:ownerCannotLeave').withReason('owner_cannot_leave');
        }
        const deleted = await this.endMembershipInContext({
          organization,
          membershipPublicId: membership.public_id,
          reason: MEMBERSHIP_DELETE_REASON.LEFT,
          note: null,
        });
        if (!deleted) {
          // The atomic owner-guard refused the delete: a concurrent transfer made this user the
          // owner after the pre-check above (which would otherwise orphan the organization), or the row
          // vanished. Re-resolve so the race surfaces the same ownerCannotLeave as the pre-check.
          const current =
            await this.organizationService.requireOrganizationRecordByPublicId(
              organization_public_id,
            );
          if (current.owner_user_id === userId) {
            throw new ForbiddenError('errors:ownerCannotLeave').withReason('owner_cannot_leave');
          }
          throw new NotFoundError('Membership');
        }
      },
    });
    // sec-R11: invalidate AFTER commit so a racing recompute can't re-cache the stale set.
    await invalidatePermissions({ userId: user_public_id, organizationId: organization_public_id });
    // REQ-4: the seat count just shrank — reconcile the Stripe subscription quantity out-of-band.
    this.enqueueSeatQuantitySync(organization_public_id);
  }

  async transferOwnership({
    scope,
    body,
    current_user_public_id,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
    current_user_public_id: string;
  }): Promise<MembershipOutput> {
    const organization_public_id = scope.organizationPublicId;
    const parsed = validateTransferOwnership(body);
    const result = await withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization =
          await this.organizationService.requireOrganizationRecordByPublicId(
            organization_public_id,
          );
        // A PERSONAL organization belongs solely to its owner and cannot be handed off.
        assertTeamOrganization({ organization, capability: 'MUTATION' });
        const currentUserId =
          await this.organizationService.resolveUserInternalIdByPublicId(current_user_public_id);
        if (currentUserId === null) throw new NotFoundError('User');
        if (organization.owner_user_id !== currentUserId) {
          throw new ForbiddenError('errors:onlyOwnerCanTransfer');
        }
        const newOwnerUserId = await this.organizationService.resolveUserInternalIdByPublicId(
          parsed.new_owner_user_id,
        );
        if (newOwnerUserId === null) throw new NotFoundError('User');
        const newOwnerMembership = await this.membershipRepository.findByUserAndOrganization(
          newOwnerUserId,
          organization.id,
        );
        if (newOwnerMembership?.status !== MEMBERSHIP_STATUS.ACTIVE) {
          // The new owner has no active membership here: as far as this organization goes, there
          // is no such member.
          throw new NotFoundError('Membership');
        }
        const transferred = await this.organizationService.transferOrganizationOwnership({
          organization_public_id,
          new_owner_user_id: newOwnerUserId,
        });
        // Serialized against the new owner, so the answer reads `is_owner: true`.
        return this.resolveAndSerializeMembership({
          membership: newOwnerMembership,
          organization: transferred,
        });
      },
    });
    // sec-R11b: ownership itself is a live DB check (never cached), but invalidate both parties'
    // cached permission sets after commit for defense-in-depth and consistency with the other
    // membership mutations, so no owner-implied permission can ever linger in cache.
    await invalidatePermissions({
      userId: current_user_public_id,
      organizationId: organization_public_id,
    });
    await invalidatePermissions({
      userId: parsed.new_owner_user_id,
      organizationId: organization_public_id,
    });
    return result;
  }

  /**
   * Counts the seat-occupying memberships (ACTIVE + INVITED) in an organization (REQ-4).
   *
   * @remarks
   * - **Algorithm:** runs {@link MembershipRepository.countActiveByOrganization} inside
   *   {@link withAppDatabaseContext} so the `memberships` RLS policy resolves the
   *   org's rows. Resolves the org's internal id from its public id first.
   * - **Failure modes:** `NotFoundError('Organization')` when the public id does not resolve.
   * - **Side effects:** one read-only COUNT query under the organization GUC.
   * - **Notes:** this is the cross-domain SERVICE entry point billing's `SubscriptionService`
   *   calls to compute `seats_used` — billing never reaches the membership repository/schema
   *   directly (cross-domain reads go service→service).
   */
  /**
   * The team facts a clinic's setup reads (feat-clinic-setup, routes-final §2.A.10), and the caller's
   * own membership — who takes the clinic live.
   *
   * @remarks
   * - **Algorithm:** in the organization's context, resolves the organization and its owner, then
   *   one read for "someone besides the owner, invited or active" and one for "an active member
   *   holds one of `bookableRoleNames` (system roles, main or extra)"; resolves the acting user's
   *   membership in the organization.
   * - **Failure modes:** `NotFoundError('Organization')` for a missing organization.
   * - **Side effects:** none (reads only).
   * - **Notes:** the role names come from the app (its Doctor and Therapist presets) — tenancy
   *   never reads the app's code.
   */
  async summarizeTeamForSetup(options: {
    scope: OrganizationPrincipalDatabaseScope;
    bookableRoleNames: readonly string[];
    actingUserPublicId: string | undefined;
  }): Promise<{
    hasTeammate: boolean;
    hasBookableMember: boolean;
    actingMembershipId: number | null;
  }> {
    return withAppDatabaseContext({
      scope: options.scope,
      callback: async () => {
        const organization = await this.organizationService.requireOrganizationRecordByPublicId(
          options.scope.organizationPublicId,
        );
        const team = await this.membershipRepository.summarizeTeamForSetup({
          organization_id: organization.id,
          owner_user_id: organization.owner_user_id,
          bookable_role_names: options.bookableRoleNames,
        });
        const userId = await this.organizationService.resolveUserInternalIdByPublicId(
          options.actingUserPublicId,
        );
        const membership =
          userId === null
            ? null
            : await this.membershipRepository.findByUserAndOrganization(userId, organization.id);
        return {
          hasTeammate: team.has_teammate,
          hasBookableMember: team.has_bookable_member,
          actingMembershipId: membership?.id ?? null,
        };
      },
    });
  }

  async countActiveMembers(options: { organizationPublicId: string }): Promise<number> {
    return withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: options.organizationPublicId }),
      callback: async () => {
        const organization = await this.organizationService.requireOrganizationByPublicId(
          options.organizationPublicId,
        );
        return this.membershipRepository.countActiveByOrganization(organization.id);
      },
    });
  }

  /**
   * F2: suspends the most-recently-joined non-owner ACTIVE members until the org's active headcount
   * fits `ceiling`; returns how many were suspended. Cross-domain entry point billing's
   * `SubscriptionService` calls after a downgrade commits.
   *
   * @remarks
   * - **Algorithm:** counts ACTIVE + INVITED seats; if `seatsUsed > ceiling`, suspends
   *   `seatsUsed - ceiling` non-owner ACTIVE members ordered by `joined_at DESC` (longest-tenured
   *   kept), then purges each suspended member's Redis permission cache so access is revoked at once
   *   rather than lingering for the cache TTL. The **owner is never suspended**, so an owner-only or
   *   owner-plus-invites organization may remain above `ceiling` (invitations are not suspendable) — the
   *   add-member ceiling check still blocks further growth.
   * - **Failure modes:** `NotFoundError('Organization')` for a missing organization; otherwise none beyond the
   *   underlying queries. Runs in the organization DB context + transaction so the count and suspend are
   *   consistent and RLS-scoped.
   * - **Side effects:** flips excess memberships to `SUSPENDED` (one `membership.updated` event
   *   each); invalidates permission caches.
   */
  async suspendExcessActiveMembersToFitCeiling(options: {
    organizationPublicId: string;
    ceiling: number;
  }): Promise<number> {
    const suspendedUserIds = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: options.organizationPublicId }),
      callback: async () => {
        const organization = await this.organizationService.requireOrganizationRecordByPublicId(
          options.organizationPublicId,
        );
        const seatsUsed = await this.membershipRepository.countActiveByOrganization(
          organization.id,
        );
        const excess = seatsUsed - options.ceiling;
        if (excess <= 0) return [];
        const suspended = await this.membershipRepository.suspendExcessActiveMembers({
          organization_id: organization.id,
          owner_user_id: organization.owner_user_id,
          suspend_count: excess,
        });
        await this.emitMembershipEvents({
          type: MEMBERSHIP_EVENT.UPDATED,
          memberships: suspended,
          organization,
        });
        return suspended.map((membership) => membership.user_id);
      },
    });
    // Post-commit (policy audit R11): purge each suspended member's permission cache OUTSIDE the
    // organization context block, so a concurrent recompute can't re-cache the pre-suspension permission set
    // before the suspend transaction commits.
    await this.invalidatePermissionsForMemberships({
      user_internal_ids: suspendedUserIds,
      organization_public_id: options.organizationPublicId,
    });
    return suspendedUserIds.length;
  }

  /**
   * Ends every membership of a login whose account is being deleted (launch K6), as a manager's
   * removal would — each through the one leave step with `delete_reason = account_deleted`, in its
   * own organization, so the clinics keep the frozen membership name and what the person did — and
   * returns the organizations the user belonged to (ended now or earlier), so account deletion can
   * erase the user's details there too.
   *
   * @remarks
   * - **Algorithm:** the user's membership rows span tenants, so they are listed under the retention
   *   maintenance context; each live membership of a live TEAM organization is then ended under that
   *   organization's own context (API keys revoked, the app's part released, `membership.deleted`
   *   emitted), its permissions purged after the commit and its seat count reconciled. The personal
   *   organization is tombstoned whole by the organization service.
   * - **Failure modes:** propagates; account deletion is re-runnable and every step is idempotent. A
   *   membership the owner guard refuses is skipped (account deletion already refuses an owner).
   * - **Side effects:** see {@link MembershipService} `endMembershipInContext`.
   */
  async removeAllForDepartingUser(
    userInternalId: number,
  ): Promise<{ organizationPublicIds: string[] }> {
    const rows = await withMaintenanceDatabaseContext({
      scope: MAINTENANCE_SCOPE.GLOBAL_RETENTION_CLEANUP,
      callback: () => this.membershipRepository.listForDepartingUser(userInternalId),
    });
    for (const row of rows) {
      if (
        row.membership_deleted_at !== null ||
        row.organization_deleted_at !== null ||
        row.organization_type === 'PERSONAL'
      ) {
        continue;
      }
      const ended = await withAppDatabaseContext({
        scope: PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: row.organization_public_id }),
        callback: async () => {
          const organization = await this.organizationService.requireOrganizationRecordByPublicId(
            row.organization_public_id,
          );
          return this.endMembershipInContext({
            organization,
            membershipPublicId: row.membership_public_id,
            reason: MEMBERSHIP_DELETE_REASON.ACCOUNT_DELETED,
            note: null,
          });
        },
      });
      if (ended) {
        await this.invalidatePermissionsForMembership({
          user_internal_id: userInternalId,
          organization_public_id: row.organization_public_id,
        });
        this.enqueueSeatQuantitySync(row.organization_public_id);
      }
    }
    return {
      organizationPublicIds: [
        ...new Set(
          rows
            .filter((row) => row.organization_deleted_at === null)
            .map((row) => row.organization_public_id),
        ),
      ],
    };
  }

  /**
   * Lists organization memberships for a GDPR data-export bundle under the requesting user's RLS
   * context (cross-organization read scoped to the owner).
   */
  async listOrganizationsForUserDataExport(options: {
    userPublicId: string;
    userInternalId: number;
    limit: number;
  }) {
    return withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: options.userPublicId }),
      callback: (_databaseHandle) =>
        this.membershipRepository.listOrganizationsForUserDataExport(
          options.userInternalId,
          options.limit,
        ),
    });
  }
}
