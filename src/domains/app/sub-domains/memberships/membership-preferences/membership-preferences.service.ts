import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { listVisibleBranchIds } from '@/domains/app/base-record.repository.js';
import type { BranchesRepository } from '@/domains/app/sub-domains/branches/branches.repository.js';
import {
  type CallerMembership,
  requireCallerMembership,
} from '@/domains/app/sub-domains/memberships/memberships.rules.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { assertRecordNotChangedSince } from '@/shared/utils/validation/record-fields.util.js';
import type {
  MembershipPreferencesFields,
  MembershipPreferencesRepository,
} from './membership-preferences.repository.js';
import {
  defaultMembershipPreferences,
  serializeMembershipPreferences,
} from './membership-preferences.serializer.js';
import type { MembershipPreferencesOutput } from './membership-preferences.types.js';
import {
  trimRecentPicks,
  validateUpdateMembershipPreferences,
} from './membership-preferences.validator.js';

const BRANCH_NOT_VISIBLE_KEY = 'errors:validation.preferenceBranchNotVisible';

/**
 * A member's own settings in the active organization (launch §2.F, U1/U4): pinned sections, theme,
 * the header's branch filter, patient-file pins and recent picks — one row per membership.
 *
 * @remarks
 * - **Algorithm:** inside the caller's `withAppDatabaseContext`, resolve the caller's own membership
 *   (403 for an API key); a read returns the row or the defaults before the first save; a save is
 *   one upsert on `membership_id`, then the branch filter is replaced when sent.
 * - **Failure modes:** `ForbiddenError('errors:ownMembershipRequired')`; `ValidationError` for a
 *   bad body or a branch the member can't see; `ConflictError` `record_changed` for a stale save.
 * - **Side effects:** the first save inserts the member's row; `branch_ids` rewrites
 *   `app.membership_preference_branches`.
 */
export class MembershipPreferencesService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly branchesRepository: BranchesRepository,
    private readonly repository: MembershipPreferencesRepository,
  ) {}

  /**
   * The caller's preferences, or the defaults (`id` null) before their first save.
   *
   * @remarks
   * - **Algorithm:** one read of the caller's row and its branch filter.
   * - **Failure modes:** `ForbiddenError` without a membership.
   */
  async getMine(
    scope: OrganizationPrincipalDatabaseScope,
    actingUserPublicId: string | undefined,
  ): Promise<MembershipPreferencesOutput> {
    return withAppDatabaseContext(scope, async () => {
      const caller = await this.requireCaller(scope, actingUserPublicId);
      const row = await this.repository.findByMembershipId(caller.membershipId);
      if (!row) return defaultMembershipPreferences();
      return serializeMembershipPreferences(row, await this.repository.listBranchPublicIds(row.id));
    });
  }

  /**
   * Saves any of the caller's preferences — the first save creates their row (U4).
   *
   * @remarks
   * - **Algorithm:** parse; check `expected_updated_at` against a saved row; resolve `branch_ids`
   *   to branches the caller can see (every branch with `branch:read`, else their own); upsert the
   *   sent fields, `recent_picks` trimmed to the newest 3 per `room:field`; replace the branch
   *   filter when sent.
   * - **Failure modes:** `ValidationError` (`branch_ids` naming a branch they can't see);
   *   `ConflictError` `record_changed`.
   */
  async updateMine(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    options: { actingUserPublicId: string | undefined; allBranches: boolean },
  ): Promise<MembershipPreferencesOutput> {
    const parsed = validateUpdateMembershipPreferences(body);
    return withAppDatabaseContext(scope, async () => {
      const caller = await this.requireCaller(scope, options.actingUserPublicId);
      const existing = await this.repository.findByMembershipId(caller.membershipId);
      if (existing) {
        await assertRecordNotChangedSince({
          row: existing,
          expected: parsed.expected_updated_at,
          resolveUserPublicId: (userInternalId) =>
            this.organizationService.resolveUserPublicIdByInternalId(userInternalId),
        });
      }
      const branchIds =
        parsed.branch_ids === undefined
          ? undefined
          : await this.resolveVisibleBranchIds({
              caller,
              branchPublicIds: parsed.branch_ids,
              allBranches: options.allBranches,
            });
      const fields: MembershipPreferencesFields = {
        ...(parsed.pinned_sections === undefined
          ? {}
          : { pinned_sections: parsed.pinned_sections }),
        ...(parsed.theme === undefined ? {} : { theme: parsed.theme }),
        ...(parsed.patient_file_pins === undefined
          ? {}
          : { patient_file_pins: parsed.patient_file_pins }),
        ...(parsed.recent_picks === undefined
          ? {}
          : { recent_picks: trimRecentPicks(parsed.recent_picks) }),
      };
      const row = await this.repository.upsert({
        organization_id: caller.organizationId,
        membership_id: caller.membershipId,
        fields,
        user_id: caller.userId,
      });
      if (branchIds !== undefined) {
        await this.repository.replaceBranches({
          membership_preference_id: row.id,
          organization_id: caller.organizationId,
          branch_ids: branchIds,
        });
      }
      return serializeMembershipPreferences(row, await this.repository.listBranchPublicIds(row.id));
    });
  }

  private requireCaller(
    scope: OrganizationPrincipalDatabaseScope,
    actingUserPublicId: string | undefined,
  ): Promise<CallerMembership> {
    return requireCallerMembership({
      organizationService: this.organizationService,
      scope,
      actingUserPublicId,
    });
  }

  /** `brn_` ids → internal ids of branches the caller can see; any other is a 400 naming it. */
  private async resolveVisibleBranchIds(options: {
    caller: CallerMembership;
    branchPublicIds: readonly string[];
    allBranches: boolean;
  }): Promise<number[]> {
    const resolved = await this.branchesRepository.findIdsByPublicIds(
      options.caller.organizationId,
      options.branchPublicIds,
    );
    const visible = options.allBranches
      ? undefined
      : new Set(
          await listVisibleBranchIds({
            organizationId: options.caller.organizationId,
            userId: options.caller.userId,
          }),
        );
    const notVisible = options.branchPublicIds.filter((publicId) => {
      const branchId = resolved.get(publicId);
      return branchId === undefined || (visible !== undefined && !visible.has(branchId));
    });
    if (notVisible.length > 0) {
      const params = { branch_id: notVisible.join(', ') };
      throw new ValidationError(BRANCH_NOT_VISIBLE_KEY, params, undefined, [
        { field: 'branch_ids', messageKey: BRANCH_NOT_VISIBLE_KEY, messageParams: params },
      ]);
    }
    return options.branchPublicIds.map((publicId) => resolved.get(publicId) as number);
  }
}
