import type { FastifyInstance } from 'fastify';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import { BranchesRepository } from './sub-domains/branches/branches.repository.js';
import { BranchesService } from './sub-domains/branches/branches.service.js';
import { BranchUserAccessesRepository } from './sub-domains/branches/branch-user-accesses/branch-user-accesses.repository.js';
import { BranchUserAccessesService } from './sub-domains/branches/branch-user-accesses/branch-user-accesses.service.js';

/** The app domain's services (the clinic records), decorated on Fastify as `appDomain`. */
export type AppContainer = {
  branchesService: BranchesService;
  branchUserAccessesService: BranchUserAccessesService;
};

/** Builds the app domain container from its repositories and the tenancy services it reads. */
export function createAppContainer(
  organizationService: OrganizationService,
  membershipService: MembershipService,
): AppContainer {
  const branchesRepository = new BranchesRepository();
  const branchUserAccessesRepository = new BranchUserAccessesRepository();
  return {
    branchesService: new BranchesService(
      organizationService,
      membershipService,
      branchesRepository,
      branchUserAccessesRepository,
    ),
    branchUserAccessesService: new BranchUserAccessesService(
      organizationService,
      membershipService,
      branchesRepository,
      branchUserAccessesRepository,
    ),
  };
}

/** Decorates `appDomain` on the Fastify instance (after the tenancy container). */
export function registerAppContainer(application: FastifyInstance): void {
  const { organizationService, membershipService } = application.tenancyDomain;
  application.decorate('appDomain', createAppContainer(organizationService, membershipService));
}
