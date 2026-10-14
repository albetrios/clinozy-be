/**
 * User-bug-report sub-domain seed contribution — one report each for a subset of registry users.
 * Composed up into the user domain's seed module after the user pool is populated.
 */
import type { SeedContribution } from '@/scripts/seed/seed-contract.js';
import { seedUserBugReportsBulk } from './user-bug-report.bulk.seed.js';

/** Bulk-only contribution that seeds per-user bug reports. */
export const userBugReportSeedContribution: SeedContribution = {
  seedBulk: seedUserBugReportsBulk,
};
