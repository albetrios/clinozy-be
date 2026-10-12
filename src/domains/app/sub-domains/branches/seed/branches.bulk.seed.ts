import type { SeedContext } from '@/scripts/seed/seed-contract.js';
import { seedBranch, seedBranchMember } from './branches.seed.js';

/** Branches every bulk-seeded organization gets: a main one and a second. */
const BULK_BRANCHES = [
  { name: 'Adajan', area: 'Adajan', is_main: true },
  { name: 'Vesu', area: 'Vesu', is_main: false },
] as const;

/**
 * Seeds two branches per organization in the registry and gives each organization's owner
 * access to both (idempotent: an existing branch name is kept).
 */
export async function seedBranchesBulk(context: SeedContext): Promise<void> {
  const organizations = context.registry.organizations;
  if (organizations.length === 0) {
    context.logger.warn(
      'seed.bulk.branches: empty organization pool; run the tenancy seeder first',
    );
    return;
  }
  for (const organization of organizations) {
    for (const branch of BULK_BRANCHES) {
      const branchId = await seedBranch({
        organization_id: organization.id,
        name: branch.name,
        area: branch.area,
        is_main: branch.is_main,
        created_by_user_id: organization.ownerUserId,
      });
      await seedBranchMember({
        branch_id: branchId,
        organization_id: organization.id,
        user_id: organization.ownerUserId,
      });
    }
  }
}
