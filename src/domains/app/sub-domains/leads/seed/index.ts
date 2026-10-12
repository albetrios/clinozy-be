import type { SeedContribution } from '@/scripts/seed/seed-contract.js';
import { seedLeadsBulk } from './leads.bulk.seed.js';

/** The leads seed contribution — bulk only (no reference data); runs after the contacts'. */
export const leadsSeedContribution: SeedContribution = {
  seedBulk: seedLeadsBulk,
};
