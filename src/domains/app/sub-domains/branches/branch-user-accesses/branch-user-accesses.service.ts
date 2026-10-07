import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { NotFoundError, ValidationError } from '@/shared/errors/index.js';
import type { BranchesRepository } from '@/domains/app/sub-domains/branches/branches.repository.js';
import type { BranchUserAccessesRepository } from './branch-user-accesses.repository.js';
import { BranchUserAccessesSerializer } from './branch-user-accesses.serializer.js';
import { validateReplaceBranchUserAccesses } from './branch-user-accesses.validator.js';

/**
 * Who works in a branch (launch ROUTE #2, D9) — read and replaced by the few who manage branches;
 * the everyday `GET /app/branches/my` reads the same rows through the branches service.
 *
 * @remarks
 * - **Algorithm:** inside the caller's `withAppDatabaseContext`, resolve the organization and the
 *   live branch (404 otherwise); a replace resolves every `mem_` id to its membership and makes that
 *   set the branch's exact access list.
 * - **Failure modes:** `NotFoundError('Branch')`; `ValidationError` for a bad body or an id that is
 *   no live member of this organization.
 * - **Side effects:** a replace deletes and inserts `app.branch_user_accesses` rows.
 */
export class BranchUserAccessesService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly membershipService: MembershipService,
    private readonly branchesRepository: BranchesRepository,
    private readonly branchUserAccessesRepository: BranchUserAccessesRepository,
  ) {}

  async list(scope: OrganizationPrincipalDatabaseScope, branchPublicId: string) {
    return withAppDatabaseContext(scope, async () => {
      const ids = await this.requireBranchId(scope, branchPublicId);
      return BranchUserAccessesSerializer.many(
        await this.branchUserAccessesRepository.listForBranch(ids.branch),
      );
    });
  }

  async replace(
    scope: OrganizationPrincipalDatabaseScope,
    branchPublicId: string,
    body: unknown,
    actingUserPublicId: string | undefined,
  ) {
    const parsed = validateReplaceBranchUserAccesses(body);
    return withAppDatabaseContext(scope, async () => {
      const ids = await this.requireBranchId(scope, branchPublicId);
      const resolved = await this.membershipService.resolveMembershipIdsByPublicIds({
        organizationId: ids.organization,
        membershipPublicIds: parsed.membership_ids,
      });
      const unknown = parsed.membership_ids.filter((publicId) => !resolved.has(publicId));
      if (unknown.length > 0) {
        throw new ValidationError(
          'errors:validation.branchMembershipNotFound',
          { membership_id: unknown.join(', ') },
          { membership_ids: unknown.map((publicId) => `${publicId} is not a member here`) },
        );
      }
      const userId =
        (await this.organizationService.resolveUserInternalIdByPublicId(actingUserPublicId)) ??
        undefined;
      await this.branchUserAccessesRepository.replaceForBranch({
        branch_id: ids.branch,
        organization_id: ids.organization,
        membership_ids: [...resolved.values()],
        created_by_user_id: userId,
      });
      return BranchUserAccessesSerializer.many(
        await this.branchUserAccessesRepository.listForBranch(ids.branch),
      );
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
