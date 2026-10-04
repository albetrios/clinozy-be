import postgres from 'postgres';
import { LOCAL_DATABASE_NAME } from '@/shared/constants/project-identity.constants.js';

/**
 * The database the Vitest harness uses on a developer machine: `<local database>_test`, beside —
 * never inside — the database `pnpm dev` serves.
 *
 * @remarks
 * Suites truncate every table with `RESTART IDENTITY` between files. Pointed at the `pnpm dev`
 * database, as the harness was before, every local `pnpm test` wiped the developer's data and
 * restarted its id counters while Redis, BullMQ and third-party idempotency stores still held the
 * old ids. CI keeps its own service-container database (see {@link pointHarnessAtLocalTestDatabase}).
 */
export const LOCAL_TEST_DATABASE_NAME = `${LOCAL_DATABASE_NAME}_test`;

/** Compose-superuser URL of {@link LOCAL_TEST_DATABASE_NAME} — the harness fallback and migration login. */
export const LOCAL_TEST_DATABASE_URL = `postgresql://${LOCAL_DATABASE_NAME}:${LOCAL_DATABASE_NAME}@localhost:5432/${LOCAL_TEST_DATABASE_NAME}`;

const DATABASE_URL_KEYS = [
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'DATABASE_MAINTENANCE_URL',
  'DATABASE_OPERATOR_URL',
] as const;

function isHarnessOnHostedDatabase(): boolean {
  return process.env.CI === 'true' || process.env.ALLOW_HOSTED_TEST_DATABASE === 'true';
}

/** Whether a Postgres connection URL points at this machine (a loopback host). */
export function isLocalDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
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
 * - **Failure modes:** none — a URL that is not local is left alone.
 * - **Side effects:** rewrites `process.env.DATABASE_URL`, `DATABASE_MIGRATION_URL`,
 *   `DATABASE_MAINTENANCE_URL` and `DATABASE_OPERATOR_URL`.
 * - **Notes:** a no-op when `CI=true` or `ALLOW_HOSTED_TEST_DATABASE=true`.
 */
export function pointHarnessAtLocalTestDatabase(): void {
  if (isHarnessOnHostedDatabase()) return;

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
    if (!isLocalDatabaseUrl(value)) continue;
    const url = new URL(value as string);
    url.pathname = `/${LOCAL_TEST_DATABASE_NAME}`;
    process.env[key] = url.toString();
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
 * - **Notes:** a no-op on CI / hosted runs and when the migration URL is not local.
 */
export async function ensureLocalTestDatabaseExists(): Promise<void> {
  if (isHarnessOnHostedDatabase()) return;
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
 * - **Notes:** CI / hosted runs get `process.env` unchanged (no `.env.local` exists there).
 */
export function buildMigrationChildEnvironment(): NodeJS.ProcessEnv {
  return isHarnessOnHostedDatabase() ? process.env : { ...process.env, NODE_ENV: 'local' };
}
