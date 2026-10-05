import { database } from '@/infrastructure/database/connection.js';
import { sql } from '@/infrastructure/database/connection.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { assertConnectedToTestDatabase } from '@/tests/helpers/local-test-database.js';
import { env } from '@/shared/config/env.config.js';
import { resetPlanCatalogMemoForTests } from '@/domains/billing/sub-domains/plan/plan-catalog-memo.js';
import { resetPermissionCatalogMemoForTests } from '@/domains/tenancy/sub-domains/permission/permission-catalog-memo.js';
import { cleanupTestRedis } from '@/tests/helpers/test-redis.js';

const MAX_CLEANUP_RETRIES = 3;
const CLEANUP_RETRY_DELAY_MS = 100;

/**
 * Whether wiping all rows is acceptable, gated on the single `TEST_MODE` flag (this is a test run).
 * `TEST_MODE` defaults false and a schema refine forbids `true` in production, so a deployed data store
 * can never be truncated; the test harness sets it true.
 */
function isDataWipeAllowed(): boolean {
  return env.TEST_MODE;
}

/** The once-per-process check that the wipe target is the test database. */
let wipeTargetCheck: Promise<void> | undefined;

/**
 * Clean up all test data from the database.
 * Uses a single TRUNCATE ... CASCADE (built in PL/pgSQL) to reduce deadlock risk; retries on deadlock.
 * Requires `TEST_MODE` (see {@link isDataWipeAllowed}) and, on a developer machine, a connection to
 * the local test database ({@link assertConnectedToTestDatabase}, checked once per process).
 */
export async function cleanupDatabase(): Promise<void> {
  if (!isDataWipeAllowed()) {
    throw new Error(
      'cleanupDatabase is disabled: it requires TEST_MODE=true, which the Vitest harness sets. ' +
        'TEST_MODE is refine-forbidden in production, so this can never truncate a deployed database.',
    );
  }
  wipeTargetCheck ??= assertConnectedToTestDatabase(getOperatorSql());
  await wipeTargetCheck;

  for (let attempt = 1; attempt <= MAX_CLEANUP_RETRIES; attempt++) {
    try {
      // Elevated on purpose: TRUNCATE across every table is not something the application
      // role may do, and under `pnpm test:rls-role` the pool under test IS that role.
      await getOperatorSql()`
        DO $$ DECLARE
          tables text;
        BEGIN
          -- Cleanup can occasionally exceed per-statement limits in CI matrix shards.
          -- Scope timeout override to this transaction only.
          PERFORM set_config('statement_timeout', '0', true);
          -- public.schema_migrations is the migration audit trail and MUST NOT be truncated.
          -- Wiping it forces the vitest global-setup pnpm db:migrate to re-apply
          -- every migration from the top on the next test run, which trips DDL
          -- non-idempotency in older migrations (e.g. CREATE POLICY without
          -- IF NOT EXISTS) and silently leaves the DB in a pre-fix state.
          -- public.permissions is exempted for the same reason (system reference data).
          SELECT string_agg(quote_ident(schemaname) || '.' || quote_ident(tablename), ', ')
          INTO tables
          FROM pg_tables
          WHERE schemaname IN ('public', 'auth', 'tenancy', 'billing', 'notify', 'audit', 'upload')
          AND tablename != 'permissions'
          AND NOT (schemaname = 'public' AND tablename = 'schema_migrations');
          IF tables IS NOT NULL AND tables != '' THEN
            EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
          END IF;
        END $$;
      `;
      await cleanupTestRedis();
      // In-process memos are invisible to a TRUNCATE. A suite that seeds a catalog and asserts on
      // it would otherwise read the previous file's memory.
      resetPlanCatalogMemoForTests();
      resetPermissionCatalogMemoForTests();
      return;
    } catch (error) {
      const isDeadlockOrTimeout =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ['40P01', '57014'].includes((error as { code: string }).code);
      if (isDeadlockOrTimeout && attempt < MAX_CLEANUP_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, CLEANUP_RETRY_DELAY_MS * attempt));
        continue;
      }
      throw error;
    }
  }
}

export { database, sql };
