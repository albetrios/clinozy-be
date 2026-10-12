import { branchesSeedContribution } from '@/domains/app/sub-domains/branches/seed/index.js';
import { contactsSeedContribution } from '@/domains/app/sub-domains/contacts/seed/index.js';
import { leadsSeedContribution } from '@/domains/app/sub-domains/leads/seed/index.js';
import { composeContributions, type DomainSeedModule } from '@/scripts/seed/seed-contract.js';

const bulkContribution = composeContributions(
  branchesSeedContribution,
  contactsSeedContribution,
  leadsSeedContribution,
);

/** The app domain's seed module (the app's own records): branches, contacts and leads after tenancy and user. */
export const appSeedModule: DomainSeedModule = {
  name: 'app',
  dependsOn: ['tenancy', 'user'],
  seedBulk: bulkContribution.seedBulk,
};
