/**
 * Runs once before all test files: prepares the test database (`prepareDatabase` — create, migrate,
 * seed the permission catalog, one database per worker). Requires Postgres (`pnpm compose:up`).
 */
import '@/shared/config/load-env-files.js';
import { workerDatabaseCount } from '@tooling/vitest/worker-databases.js';
import type { TestProject } from 'vitest/node';
import { prepareDatabase } from '@/scripts/ops/db-prepare.js';
import { acquireDatabaseSuiteLock } from '@/tests/database-suite-lock.js';
import pg from 'pg';
import {
  buildMigrationChildEnvironment,
  isHarnessOnProvidedDatabase,
  LOCAL_TEST_DATABASE_URL,
  pointHarnessAtLocalTestDatabase,
} from '@/tests/helpers/local-test-database.js';

/**
 * Vitest global setup: prepares the test database the one way every database is set up. Skipped
 * when the contract / property / unit-only slices set `CONTRACT_TESTS_ENABLED`,
 * `PROPERTY_TESTS_ENABLED` or `VITEST_SKIP_DATABASE`.
 *
 * @remarks
 * - **Algorithm:** {@link prepareDatabase} with the `permissions` seed — `tenancy.permissions` is
 *   reference data from the seed, not a migration, and `cleanupDatabase()` keeps it between suites,
 *   so without it the catalog existed only once some suite happened to call `seedAllPermissions()`
 *   (personal-organization provisioning then failed the `role_permissions` → `permissions` FK and
 *   the read-safe path swallowed it). Then one clone of the prepared database per pool slot
 *   ({@link workerDatabaseCount}), which each worker's `src/tests/setup.ts` points itself at.
 * - **Failure modes:** a failed migration, seed or clone fails the run — a suite on a half-migrated
 *   database tests something that will never ship. Only an unreachable database is tolerated outside
 *   a provided database, so unit tests still run without Docker; every database-bound test then
 *   fails on its own connection.
 * - **Notes:** the seed reads the `DATABASE_URL` chosen here — the operator role locally, the
 *   superuser in CI. FORCE ROW LEVEL SECURITY on `tenancy.permissions` would refuse the
 *   RLS-subject application role.
 */
export default async function globalSetup(project: TestProject): Promise<() => void> {
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

  if (!((await isServerReachable()) || isHarnessOnProvidedDatabase())) {
    console.warn('Test database unavailable — skipping global setup. Start it: pnpm compose:up');
    return releaseDatabaseSuiteLock;
  }

  await prepareDatabase({
    seed: 'permissions',
    enableLocalLogins: false,
    workerDatabases: workerDatabaseCount({
      maxWorkers: project.vitest.config.maxWorkers,
      projectMaxWorkers: project.vitest.projects.map((selected) => selected.config.maxWorkers),
    }),
    // Keeps the child on the test database: see buildMigrationChildEnvironment.
    migrationEnvironment: buildMigrationChildEnvironment(),
    migrationOutput: 'pipe',
  });

  return releaseDatabaseSuiteLock;
}

/** Whether the test database's server answers, logging in the way the migrations will. */
async function isServerReachable(): Promise<boolean> {
  const server = new URL(
    process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? LOCAL_TEST_DATABASE_URL,
  );
  server.pathname = '/postgres';
  const client = new pg.Client({ connectionString: server.toString() });
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}
