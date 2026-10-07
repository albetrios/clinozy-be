import type { SeedContribution } from '@/scripts/seed/seed-contract.js';
import { seedBranchesBulk } from './branches.bulk.seed.js';

/** The branches seed contribution — bulk only (no reference data). */
export const branchesSeedContribution: SeedContribution = {
  seedBulk: seedBranchesBulk,
};
