import { branchesSeedContribution } from '@/domains/app/sub-domains/branches/seed/index.js';
import { composeContributions, type DomainSeedModule } from '@/scripts/seed/seed-contract.js';

const bulkContribution = composeContributions(branchesSeedContribution);

/** The app domain's seed module (the clinic records): branches after tenancy and user. */
export const appSeedModule: DomainSeedModule = {
  name: 'app',
  dependsOn: ['tenancy', 'user'],
  seedBulk: bulkContribution.seedBulk,
};
