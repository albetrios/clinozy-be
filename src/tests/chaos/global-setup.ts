import '@/shared/config/load-env-files.js';
import { waitProvisionAndGloballyClearChaosProxyListeners } from '@/tests/chaos/helpers/toxiproxy.client.js';
import { workerDatabaseCount } from '@tooling/vitest/worker-databases.js';
import type { TestProject } from 'vitest/node';
import { prepareDatabase } from '@/scripts/ops/db-prepare.js';
import { acquireDatabaseSuiteLock } from '@/tests/database-suite-lock.js';
import {
  buildMigrationChildEnvironment,
  pointHarnessAtLocalTestDatabase,
} from '@/tests/helpers/local-test-database.js';

/**
 * Prepares the test database, then provisions the Toxiproxy routes before forks import database
 * and Redis singletons pointing at the proxies.
 *
 * @remarks
 * The chaos config replaces the root global setup, so it prepares the database the same one way
 * (`prepareDatabase`: create, migrate, the permission catalog, one database per worker) — locally
 * and on CI's service container alike. `bootstrap-env.ts` then points each chaos fork at its own
 * worker database through the proxy (never the one `pnpm dev` serves). Migrations go over the
 * direct connection, not the proxy, so no leftover toxin can fail them. It takes the same database
 * lock as the main suite: both use the one test database.
 */
export default async function globalSetupForVitestChaosSuite(
  project: TestProject,
): Promise<() => void> {
  pointHarnessAtLocalTestDatabase();
  const releaseDatabaseSuiteLock = acquireDatabaseSuiteLock();
  await prepareDatabase({
    seed: 'permissions',
    enableLocalLogins: false,
    workerDatabases: workerDatabaseCount({
      maxWorkers: project.vitest.config.maxWorkers,
      projectMaxWorkers: project.vitest.projects.map((selected) => selected.config.maxWorkers),
    }),
    migrationEnvironment: buildMigrationChildEnvironment(),
    migrationOutput: 'pipe',
  });
  await waitProvisionAndGloballyClearChaosProxyListeners();
  return releaseDatabaseSuiteLock;
}
