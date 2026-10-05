/**
 * Runs once before all test files: creates and migrates the test database and seeds the
 * permission catalog. Requires Postgres (`pnpm compose:up`).
 */
import '@/shared/config/load-env-files.js';
import { execSync } from 'node:child_process';
import { acquireDatabaseSuiteLock } from '@/tests/database-suite-lock.js';
import postgres from 'postgres';
import {
  buildMigrationChildEnvironment,
  ensureLocalTestDatabaseExists,
  isHarnessOnProvidedDatabase,
  LOCAL_TEST_DATABASE_URL,
  pointHarnessAtLocalTestDatabase,
} from '@/tests/helpers/local-test-database.js';

/**
 * Vitest global setup: migrates the test database and seeds the permission catalog. Skipped when
 * the contract / property / unit-only slices set `CONTRACT_TESTS_ENABLED`,
 * `PROPERTY_TESTS_ENABLED` or `VITEST_SKIP_DATABASE`.
 *
 * @remarks
 * A failed migration or seed fails the run — a suite on a half-migrated database tests something
 * that will never ship. Only an unreachable database is tolerated outside a provided database, so
 * unit tests still run without Docker; every database-bound test then fails on its own connection.
 */
export default async function globalSetup(): Promise<() => void> {
  // Vitest sets its own NODE_ENV before this runs, and the env loader then layers the
  // machine-local env file on top. The test forks run as `development` (src/tests/setup.ts); so
  // does this process, whose permission seed parses the env schema.
  process.env.NODE_ENV = 'development';
  pointHarnessAtLocalTestDatabase();

  /** Contract tests mock outbound HTTP — skip Postgres churn (offline CI slice). See `pnpm test:contract`. */
  if (process.env.CONTRACT_TESTS_ENABLED === 'true') {
    return () => {};
  }

  /** fast-check property slice — pure validators, no DB. See `pnpm test:property`. */
  if (process.env.PROPERTY_TESTS_ENABLED === 'true') {
    return () => {};
  }

  /** PR unit lane — unit + global policy scans without Postgres. See reusable-vitest-unit-only.yml. */
  if (process.env.VITEST_SKIP_DATABASE === 'true') {
    return () => {};
  }

  process.env.DATABASE_URL ??= LOCAL_TEST_DATABASE_URL;

  // Past every early return, this run WILL touch Postgres — so claim it. Placed here rather than
  // at the top so the no-database lanes (contract, property, the PR unit lane) never take a lock
  // they do not need.
  const releaseDatabaseSuiteLock = acquireDatabaseSuiteLock();

  const migrationUrl = process.env.DATABASE_URL;
  if (!migrationUrl) {
    throw new Error('DATABASE_URL must be set for test global setup');
  }
  const sql = postgres(migrationUrl, { max: 1 });

  try {
    // First local run: the test database does not exist yet (CI's service container brings its own).
    await ensureLocalTestDatabaseExists();
    await sql`SELECT 1`;
  } catch (connectionError) {
    if (isHarnessOnProvidedDatabase()) {
      throw connectionError;
    }
    console.warn('Test database unavailable — skipping global setup. Start it: pnpm compose:up');
    await sql.end({ timeout: 5_000 }).catch(() => {});
    return releaseDatabaseSuiteLock;
  }

  try {
    execSync('pnpm db:migrate', {
      stdio: 'pipe',
      encoding: 'utf-8',
      // Keeps the child on the test database: see buildMigrationChildEnvironment.
      env: buildMigrationChildEnvironment(),
      cwd: process.cwd(),
    });
    await seedPermissionCatalog();
  } finally {
    await sql.end({ timeout: 5_000 });
  }

  return releaseDatabaseSuiteLock;
}

/**
 * Seeds the permission catalog the way a deploy does: migrate, then the reference seed.
 *
 * `tenancy.permissions` is reference data from `pnpm db:seed`, not a migration, and
 * `cleanupDatabase()` preserves it between suites — so without this the catalog existed only once
 * some suite happened to call `seedAllPermissions()`. Suites that ran first saw a near-empty
 * catalog: personal-organization provisioning failed the `role_permissions` → `permissions` FK,
 * the read-safe path swallowed it, and the user silently had no personal organization.
 *
 * Runs the reference seeder itself (no second code list), imported only now so the app pool it
 * opens reads the `DATABASE_URL` chosen above — the operator role locally, the superuser in CI.
 * FORCE ROW LEVEL SECURITY on `tenancy.permissions` would refuse the RLS-subject application role.
 */
async function seedPermissionCatalog(): Promise<void> {
  const { resetEnvCacheForTests } = await import('@/shared/config/env.config.js');
  resetEnvCacheForTests();
  const { seedPermissions } = await import(
    '@/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.js'
  );
  const { closeDatabase } = await import('@/infrastructure/database/connection.js');
  try {
    await seedPermissions();
  } finally {
    await closeDatabase();
  }
}
