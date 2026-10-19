import { workerDatabaseName } from '@tooling/vitest/worker-databases.js';
import { sql } from 'drizzle-orm';
import type { PostgresDatabaseHandle } from '@/infrastructure/database/utils/database-handle.types.js';
import {
  DATABASE_URL_KEYS,
  isLocalDatabaseUrl,
} from '@/infrastructure/database/utils/connection-url.util.js';
import {
  LOCAL_DATABASE_NAME,
  PROJECT_SLUG,
} from '@/shared/constants/project-identity.constants.js';

/**
 * The database the Vitest harness uses on a developer machine: `<project>_test` — the project slug
 * in snake_case, the same `<project>_` stem as the database roles — beside, never inside, the
 * database `pnpm dev` serves. It is the template every worker's own database is cloned from
 * (`<project>_test_worker_<pool id>`); no test runs on it.
 *
 * @remarks
 * Suites truncate every table with `RESTART IDENTITY` between files. Pointed at the `pnpm dev`
 * database, as the harness was before, every local `pnpm test` wiped the developer's data and
 * restarted its id counters while Redis, BullMQ and third-party idempotency stores still held the
 * old ids. CI keeps its own service-container database (see {@link pointHarnessAtLocalTestDatabase}).
 */
export const LOCAL_TEST_DATABASE_NAME = `${PROJECT_SLUG.replaceAll('-', '_')}_test`;

/** Compose-superuser URL of {@link LOCAL_TEST_DATABASE_NAME} — the harness fallback and migration login. */
export const LOCAL_TEST_DATABASE_URL = `postgresql://${LOCAL_DATABASE_NAME}:${LOCAL_DATABASE_NAME}@localhost:5432/${LOCAL_TEST_DATABASE_NAME}`;

/** The `DATABASE_*URL`s the harness cannot run without; the operator URL is an optional pool. */
const REQUIRED_DATABASE_URL_KEYS = new Set<string>([
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'DATABASE_MAINTENANCE_URL',
]);

/**
 * Whether the harness runs on a database it was handed rather than the local test database: a
 * GitHub Actions runner's service container, or a dedicated hosted test database opted into with
 * `ALLOW_HOSTED_TEST_DATABASE=true`.
 *
 * @remarks
 * `GITHUB_ACTIONS`, not `CI`: a developer shell often exports `CI=true` (many tools read it to turn
 * off prompts), and that alone must never point the harness at the developer's own database.
 */
export function isHarnessOnProvidedDatabase(): boolean {
  return process.env.GITHUB_ACTIONS === 'true' || process.env.ALLOW_HOSTED_TEST_DATABASE === 'true';
}

/**
 * Points every database URL the harness reads at {@link LOCAL_TEST_DATABASE_NAME} on a developer
 * machine.
 *
 * @remarks
 * - **Algorithm:** the pool under test is the elevated `DATABASE_OPERATOR_URL` login when the env
 *   file provisions one (its `DATABASE_URL` is the RLS-subject app role, which can neither run the
 *   harness's cross-tenant fixtures nor `TRUNCATE`), else the env file's own local `DATABASE_URL`,
 *   else the Compose superuser. Every local `DATABASE_*URL` then has its database renamed to the
 *   test database, keeping its login — role passwords are cluster-wide, so each login works there.
 *   A URL that is not local is never the test database: the main, migration and maintenance
 *   logins fall back to the Compose superuser, and the optional operator login is dropped so its
 *   pool falls back to the main one — a remote URL left in place was truncated by every suite.
 * - **Failure modes:** none.
 * - **Side effects:** rewrites or unsets `process.env.DATABASE_URL`, `DATABASE_MIGRATION_URL`,
 *   `DATABASE_MAINTENANCE_URL` and `DATABASE_OPERATOR_URL`.
 * - **Notes:** a no-op when {@link isHarnessOnProvidedDatabase}.
 */
export function pointHarnessAtLocalTestDatabase(): void {
  if (isHarnessOnProvidedDatabase()) return;

  const operatorUrl = process.env.DATABASE_OPERATOR_URL;
  if (operatorUrl && isLocalDatabaseUrl(operatorUrl)) {
    process.env.DATABASE_URL = operatorUrl;
    process.env.DATABASE_MIGRATION_URL ??= LOCAL_TEST_DATABASE_URL;
  } else if (!isLocalDatabaseUrl(process.env.DATABASE_URL)) {
    process.env.DATABASE_URL = LOCAL_TEST_DATABASE_URL;
    process.env.DATABASE_MIGRATION_URL = LOCAL_TEST_DATABASE_URL;
  }

  for (const key of DATABASE_URL_KEYS) {
    const value = process.env[key];
    if (!value) continue;
    if (!isLocalDatabaseUrl(value)) {
      if (REQUIRED_DATABASE_URL_KEYS.has(key)) {
        process.env[key] = LOCAL_TEST_DATABASE_URL;
      } else {
        delete process.env[key];
      }
      continue;
    }
    const url = new URL(value);
    url.pathname = `/${LOCAL_TEST_DATABASE_NAME}`;
    process.env[key] = url.toString();
  }
}

/**
 * Throws unless a connection is on the local test database — the guard in front of every wipe.
 *
 * @remarks
 * - **Algorithm:** with `ALLOW_HOSTED_TEST_DATABASE=true`, passes. On a GitHub Actions runner,
 *   passes only when every `DATABASE_*URL` is on the runner itself (its service container, reached
 *   over loopback). Otherwise asks the server for `current_database()` and accepts only a worker's
 *   own database, `<{@link LOCAL_TEST_DATABASE_NAME}>_worker_<pool id>`.
 * - **Failure modes:** throws, naming the database or the env variable it refused, so no suite can
 *   `TRUNCATE` the database `pnpm dev` serves — or a remote one — whatever an env file or a
 *   workflow says. The restore drills once ran an integration suite on a runner against a restored
 *   copy of production; only a missing table privilege stopped its wipe.
 * - **Side effects:** at most one read-only query.
 */
export async function assertConnectedToTestDatabase(
  databaseHandle: Pick<PostgresDatabaseHandle, 'execute'>,
): Promise<void> {
  if (process.env.ALLOW_HOSTED_TEST_DATABASE === 'true') return;
  if (process.env.GITHUB_ACTIONS === 'true') {
    const remoteKey = DATABASE_URL_KEYS.find(
      (key) => process.env[key] !== undefined && !isLocalDatabaseUrl(process.env[key]),
    );
    if (remoteKey) {
      throw new Error(
        `Refusing to wipe: ${remoteKey} points off this runner. On GitHub Actions test cleanup ` +
          "only runs against the job's own service container; set ALLOW_HOSTED_TEST_DATABASE=true " +
          'for a dedicated hosted test database.',
      );
    }
    return;
  }
  const result = await databaseHandle.execute<{ name: string }>(
    sql`SELECT current_database() AS name`,
  );
  const [row] = Array.isArray(result)
    ? (result as { name: string }[])
    : ((result as { rows?: { name: string }[] }).rows ?? []);
  if (!isWorkerTestDatabase(row?.name)) {
    throw new Error(
      `Refusing to wipe database "${String(row?.name)}": on a developer machine test cleanup only ` +
        `runs against a worker's "${LOCAL_TEST_DATABASE_NAME}_worker_<n>". Check the DATABASE_*URL values in your env ` +
        'files, or set ALLOW_HOSTED_TEST_DATABASE=true for a dedicated hosted test database.',
    );
  }
}

/**
 * Environment for the migration child a Vitest global setup's `prepareDatabase` starts.
 *
 * @remarks
 * - **Algorithm:** the child re-runs the env-file loader. Under the harness's `NODE_ENV` it layers
 *   `.env.local` with `override: true`, which would point the migration back at the `pnpm dev`
 *   database; `NODE_ENV=local` makes `.env.local` the primary file, loaded WITHOUT override, so
 *   the test-database URLs passed down win.
 * - **Failure modes:** none.
 * - **Side effects:** none — returns a copy of `process.env`.
 * - **Notes:** a run on a provided database gets `process.env` unchanged (no `.env.local`
 *   exists there).
 */
export function buildMigrationChildEnvironment(): NodeJS.ProcessEnv {
  return isHarnessOnProvidedDatabase() ? process.env : { ...process.env, NODE_ENV: 'local' };
}

/** Whether `name` is a worker's own clone of {@link LOCAL_TEST_DATABASE_NAME}: the only database the wipe guard accepts. */
function isWorkerTestDatabase(name: string | undefined): boolean {
  if (name === undefined) return false;
  return new RegExp(`^${LOCAL_TEST_DATABASE_NAME}_worker_[0-9]+$`).test(name);
}

/** This worker's Vitest pool id, or a thrown error when the code runs outside a Vitest worker. */
function workerPoolId(): string {
  const worker = process.env.VITEST_POOL_ID;
  if (!(worker && /^[0-9]+$/.test(worker))) {
    throw new Error('The test harness runs in a Vitest worker only (VITEST_POOL_ID is unset).');
  }
  return worker;
}

/**
 * Points this worker's `DATABASE_*URL`s at its own clone of the test database.
 *
 * @remarks
 * - **Algorithm:** each set URL keeps its login (roles are cluster-wide, so every login works in
 *   the clone) and gets `workerDatabaseName` of its own database — the clone the global setup made
 *   for this pool id.
 * - **Failure modes:** throws outside a Vitest worker (no pool id).
 * - **Side effects:** rewrites `process.env.DATABASE_URL`, `DATABASE_MIGRATION_URL`,
 *   `DATABASE_MAINTENANCE_URL` and `DATABASE_OPERATOR_URL` when set.
 */
export function pointWorkerAtItsOwnDatabase(): void {
  const worker = workerPoolId();
  for (const key of DATABASE_URL_KEYS) {
    const value = process.env[key];
    if (!value) continue;
    const url = new URL(value);
    url.pathname = `/${workerDatabaseName({ database: url.pathname.slice(1), worker })}`;
    process.env[key] = url.toString();
  }
}

/**
 * The test Redis key prefix of this worker: `<stem>:worker-<pool id>:test:` — its own namespace,
 * still ending in `:test:`, which the Redis cleanup requires.
 */
export function testRedisKeyPrefix(stem: string): string {
  return `${stem}:worker-${workerPoolId()}:test:`;
}
