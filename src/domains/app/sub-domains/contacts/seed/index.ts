import type { SeedContribution } from '@/scripts/seed/seed-contract.js';
import { seedContactsBulk } from './contacts.bulk.seed.js';

/** The contacts seed contribution — bulk only (no reference data). */
export const contactsSeedContribution: SeedContribution = {
  seedBulk: seedContactsBulk,
};
