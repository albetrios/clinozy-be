import postgres from 'postgres';
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
 * database `pnpm dev` serves.
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
 * - **Algorithm:** asks the server for `current_database()` and compares it with
 *   {@link LOCAL_TEST_DATABASE_NAME}; skipped when {@link isHarnessOnProvidedDatabase}.
 * - **Failure modes:** throws, naming the database it refused, so no suite can `TRUNCATE` the
 *   database `pnpm dev` serves — or a remote one — whatever an env file says.
 * - **Side effects:** one read-only query.
 */
export async function assertConnectedToTestDatabase(
  query: ReturnType<typeof postgres>,
): Promise<void> {
  if (isHarnessOnProvidedDatabase()) return;
  const [row] = await query<{ name: string }[]>`SELECT current_database() AS name`;
  if (row?.name !== LOCAL_TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to wipe database "${String(row?.name)}": on a developer machine test cleanup only ` +
        `runs against "${LOCAL_TEST_DATABASE_NAME}". Check the DATABASE_*URL values in your env ` +
        'files, or set ALLOW_HOSTED_TEST_DATABASE=true for a dedicated hosted test database.',
    );
  }
}

/**
 * Creates {@link LOCAL_TEST_DATABASE_NAME} on the local server when it does not exist yet.
 *
 * @remarks
 * - **Algorithm:** connect to the server's `postgres` database with the migration login (the
 *   Compose superuser) and `CREATE DATABASE` when `pg_database` has no such row. A concurrent run
 *   that created it first (`42P04 duplicate_database`) counts as success.
 * - **Failure modes:** connection errors propagate.
 * - **Side effects:** may create one database.
 * - **Notes:** a no-op when {@link isHarnessOnProvidedDatabase} and when the migration URL is not
 *   local.
 */
export async function ensureLocalTestDatabaseExists(): Promise<void> {
  if (isHarnessOnProvidedDatabase()) return;
  const migrationUrl = process.env.DATABASE_MIGRATION_URL ?? LOCAL_TEST_DATABASE_URL;
  if (!isLocalDatabaseUrl(migrationUrl)) return;

  const serverUrl = new URL(migrationUrl);
  serverUrl.pathname = '/postgres';
  const sql = postgres(serverUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const existing =
      await sql`SELECT 1 FROM pg_database WHERE datname = ${LOCAL_TEST_DATABASE_NAME}`;
    if (existing.length === 0) {
      await sql`CREATE DATABASE ${sql(LOCAL_TEST_DATABASE_NAME)}`;
    }
  } catch (error) {
    if ((error as { code?: string }).code !== '42P04') throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Environment for the `pnpm db:migrate` child a Vitest global setup spawns.
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
