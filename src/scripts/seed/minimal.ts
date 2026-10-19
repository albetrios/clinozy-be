/**
 * Minimal seed — the bare minimum data the app needs to start:
 * - System permissions (tenancy)
 * - Default plans (billing)
 *
 * Run by `pnpm db:seed` (`src/scripts/ops/db-prepare.ts`, seed level `minimal`), which migrates
 * first and drains the pool after.
 */
import { seedPermissions } from '@/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.js';
import { seedPlans } from '@/domains/billing/sub-domains/plan/seed/plan.reference.seed.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Seeds the permission catalog and the default plans. Idempotent — both upsert.
 *
 * @remarks
 * Does not manage the database connection: the caller drains the pool.
 */
export async function runMinimalSeed(): Promise<void> {
  logger.info('seed.minimal: starting');

  await seedPermissions();
  logger.info('seed.minimal: permissions seeded');

  await seedPlans();
  logger.info('seed.minimal: plans seeded');

  logger.info('seed.minimal: done');
}
