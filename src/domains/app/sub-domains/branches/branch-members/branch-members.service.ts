import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type {
  MembershipBranchAccessPort,
  MembershipService,
} from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { NotFoundError, ValidationError } from '@/shared/errors/index.js';
import type { BranchesRepository } from '@/domains/app/sub-domains/branches/branches.repository.js';
import type { BranchMembersRepository } from './branch-members.repository.js';
import { BranchMembersSerializer } from './branch-members.serializer.js';
import { resolveMembershipIds } from '@/domains/app/sub-domains/memberships/memberships.rules.js';
import { validateReplaceBranchMembers } from './branch-members.validator.js';

/**
 * Who works in a branch (launch ROUTE #2, D9) — read and replaced by the few who manage branches;
 * the everyday `GET /app/branches/my` reads the same rows through the branches service.
 *
 * @remarks
 * - **Algorithm:** inside the caller's `withAppDatabaseContext`, resolve the organization and the
 *   live branch (404 otherwise); a replace resolves every `mem_` id to its membership and makes that
 *   set the branch's exact member list.
 * - **Failure modes:** `NotFoundError('Branch')`; `ValidationError` for a bad body or an id that is
 *   no live member of this organization.
 * - **Side effects:** a replace deletes and inserts `app.branch_members` rows (an ended member's
 *   row stays, D57) and clears a default-staff field naming someone no longer working there (C15).
 */
export class BranchMembersService implements MembershipBranchAccessPort {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly membershipService: MembershipService,
    private readonly branchesRepository: BranchesRepository,
    private readonly branchMembersRepository: BranchMembersRepository,
  ) {}

  async list(scope: OrganizationPrincipalDatabaseScope, branchPublicId: string) {
    return withAppDatabaseContext(scope, async () => {
      const ids = await this.requireBranchId(scope, branchPublicId);
      return BranchMembersSerializer.many(
        await this.branchMembersRepository.listForBranch(ids.branch),
      );
    });
  }

  async replace(
    scope: OrganizationPrincipalDatabaseScope,
    branchPublicId: string,
    body: unknown,
    actingUserPublicId: string | undefined,
  ) {
    const parsed = validateReplaceBranchMembers(body);
    return withAppDatabaseContext(scope, async () => {
      const ids = await this.requireBranchId(scope, branchPublicId);
      const resolved = await resolveMembershipIds({
        membershipService: this.membershipService,
        organizationId: ids.organization,
        membershipPublicIds: parsed.membership_ids,
      });
      const userId =
        (await this.organizationService.resolveUserInternalIdByPublicId(actingUserPublicId)) ??
        undefined;
      await this.branchMembersRepository.replaceForBranch({
        branch_id: ids.branch,
        organization_id: ids.organization,
        membership_ids: [...resolved.values()],
        created_by_user_id: userId,
      });
      // C15 / D14: a default-staff field names one of the branch's members.
      await this.branchesRepository.clearDefaultStaffNotWorkingThere({
        organization_id: ids.organization,
        branch_id: ids.branch,
      });
      return BranchMembersSerializer.many(
        await this.branchMembersRepository.listForBranch(ids.branch),
      );
    });
  }

  /**
   * The branches each membership works in, for the membership routes (launch ROUTE #4). Runs in
   * the caller's context.
   */
  async listBranchPublicIdsByMembershipIds(options: {
    membershipIds: readonly number[];
  }): Promise<Map<number, string[]>> {
    return this.branchMembersRepository.listBranchPublicIdsByMembershipIds(options.membershipIds);
  }

  /**
   * The memberships that work at a branch — the team list's `branch_id` filter (launch T2). Runs in
   * the caller's context.
   *
   * @remarks
   * - **Algorithm:** resolve the `brn_` id inside the organization, then its member rows.
   * - **Failure modes:** none; `null` for an id that is no branch of the organization.
   */
  async listMembershipIdsAtBranch(options: {
    organizationId: number;
    branchPublicId: string;
  }): Promise<number[] | null> {
    const resolved = await this.branchesRepository.findIdsByPublicIds(options.organizationId, [
      options.branchPublicId,
    ]);
    const branchId = resolved.get(options.branchPublicId);
    if (branchId === undefined) return null;
    return this.branchMembersRepository.listMembershipIdsForBranch(branchId);
  }

  /**
   * Sets the exact branches a membership works in (the member invite and edit, launch ROUTE #4).
   *
   * @remarks
   * - **Algorithm:** in the caller's context, resolve every `brn_` id to a live branch of the
   *   organization, then make that set the membership's branch list.
   * - **Failure modes:** `ValidationError` on `branch_ids` for an id that is no live branch here.
   * - **Side effects:** deletes and inserts `app.branch_members` rows.
   */
  async replaceBranchesForMembership(options: {
    organizationId: number;
    membershipId: number;
    branchPublicIds: readonly string[];
    createdByUserId: number | null;
  }): Promise<void> {
    const resolved = await this.branchesRepository.findIdsByPublicIds(
      options.organizationId,
      options.branchPublicIds,
    );
    const unknown = options.branchPublicIds.filter((publicId) => !resolved.has(publicId));
    if (unknown.length > 0) {
      const params = { branch_id: unknown.join(', ') };
      throw new ValidationError('errors:validation.membershipBranchNotFound', params, undefined, [
        {
          field: 'branch_ids',
          messageKey: 'errors:validation.membershipBranchNotFound',
          messageParams: params,
        },
      ]);
    }
    await this.branchMembersRepository.replaceForMembership({
      membership_id: options.membershipId,
      organization_id: options.organizationId,
      branch_ids: [...resolved.values()],
      created_by_user_id: options.createdByUserId,
    });
    // C15 / D14: the branches they no longer work at drop them from their default staff.
    await this.branchesRepository.clearDefaultStaffNotWorkingThere({
      organization_id: options.organizationId,
      membership_id: options.membershipId,
    });
  }

  /** The organization's and the live branch's internal ids; 404 when the branch is not here. */
  private async requireBranchId(
    scope: OrganizationPrincipalDatabaseScope,
    branchPublicId: string,
  ): Promise<{ organization: number; branch: number }> {
    const organization = await this.organizationService.requireOrganizationByPublicId(
      scope.organizationPublicId,
    );
    const branch = await this.branchesRepository.findByPublicId(branchPublicId, organization.id);
    if (!branch) throw new NotFoundError('Branch');
    return { organization: organization.id, branch: branch.id };
  }
}
