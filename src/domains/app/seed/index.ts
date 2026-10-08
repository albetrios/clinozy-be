import { branchesSeedContribution } from '@/domains/app/sub-domains/branches/seed/index.js';
import { contactsSeedContribution } from '@/domains/app/sub-domains/contacts/seed/index.js';
import { composeContributions, type DomainSeedModule } from '@/scripts/seed/seed-contract.js';

const bulkContribution = composeContributions(branchesSeedContribution, contactsSeedContribution);

/** The app domain's seed module (the app's own records): branches and contacts after tenancy and user. */
export const appSeedModule: DomainSeedModule = {
  name: 'app',
  dependsOn: ['tenancy', 'user'],
  seedBulk: bulkContribution.seedBulk,
};
