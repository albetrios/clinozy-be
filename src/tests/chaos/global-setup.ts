import '@/shared/config/load-env-files.js';
import { execFileSync } from 'node:child_process';
import { waitProvisionAndGloballyClearChaosProxyListeners } from '@/tests/chaos/helpers/toxiproxy.client.js';
import { acquireDatabaseSuiteLock } from '@/tests/database-suite-lock.js';
import {
  buildMigrationChildEnvironment,
  ensureLocalTestDatabaseExists,
  isHarnessOnProvidedDatabase,
  pointHarnessAtLocalTestDatabase,
} from '@/tests/helpers/local-test-database.js';

/**
 * Provision Toxiproxy routes before forks import database/redis singletons pointing at proxies.
 *
 * @remarks
 * Locally it also creates and migrates the harness's own test database first — the chaos config
 * replaces the root global setup, and `bootstrap-env.ts` points every chaos fork at that database
 * (never the one `pnpm dev` serves). Migrations go over the direct connection, not the proxy, so
 * no leftover toxin can fail them. CI migrates its service-container database in the workflow.
 * It takes the same database lock as the main suite: both truncate the one test database.
 */
export default async function globalSetupForVitestChaosSuite(): Promise<() => void> {
  if (!isHarnessOnProvidedDatabase()) {
    pointHarnessAtLocalTestDatabase();
  }
  const releaseDatabaseSuiteLock = acquireDatabaseSuiteLock();
  if (!isHarnessOnProvidedDatabase()) {
    await ensureLocalTestDatabaseExists();
    execFileSync('pnpm', ['db:migrate'], {
      stdio: 'pipe',
      encoding: 'utf-8',
      env: buildMigrationChildEnvironment(),
      cwd: process.cwd(),
    });
  }
  await waitProvisionAndGloballyClearChaosProxyListeners();
  return releaseDatabaseSuiteLock;
}
