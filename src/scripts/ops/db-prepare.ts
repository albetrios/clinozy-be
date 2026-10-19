/**
 * The one way to set up a database. `pnpm db:migrate`, `pnpm db:seed` and `pnpm db:seed:full` run
 * it from the command line (each up to its own seed level, `--reset` to start from an empty
 * database); the Vitest global setups, the cloud stack, `pnpm setup:local` and every CI job reach
 * it through one of those commands or {@link prepareDatabase} directly. Its steps, always in this
 * order:
 *
 *   create → migrate → logins → seed → worker databases
 *
 * Usage:
 *   pnpm db:migrate [--reset]     # seed none
 *   pnpm db:seed [--reset]        # the minimal reference rows (permissions, plans)
 *   pnpm db:seed:full [--reset]   # the full demo data
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { enableLocalDatabaseLogins } from '@tooling/dev/local-database-logins.js';
import { isMain, parseCommandLine } from '@tooling/setup/common/script.js';
import { workerDatabaseName } from '@tooling/vitest/worker-databases.js';
import { isLocalDatabaseUrl } from '@/infrastructure/database/utils/connection-url.util.js';

/** The migration runner {@link prepareDatabase} starts as a child process, from the sources. */
const MIGRATION_RUNNER = 'src/infrastructure/database/migration/migrate.ts';

/**
 * The migration runner of this build: the compiled `migrate.js` beside this file when it runs
 * from `dist/` (an image has no tsx and no sources), else the TypeScript source through tsx.
 */
function migrationCommand(): { readonly command: string; readonly args: readonly string[] } {
  if (fileURLToPath(import.meta.url).endsWith('.js')) {
    const compiled = new URL('../../infrastructure/database/migration/migrate.js', import.meta.url);
    return { command: process.execPath, args: [fileURLToPath(compiled)] };
  }
  return { command: 'pnpm', args: ['exec', 'tsx', MIGRATION_RUNNER] };
}

/**
 * How far {@link prepareDatabase} seeds, each level including the one before: `permissions` (the
 * permission catalog — the reference rows the test cleanup keeps), `minimal` (plus the default
 * plans; `pnpm db:seed`), `full` (plus the demo data; `pnpm db:seed:full`).
 */
export const SEED_LEVELS = ['none', 'permissions', 'minimal', 'full'] as const;

/** One of {@link SEED_LEVELS}. */
export type SeedLevel = (typeof SEED_LEVELS)[number];

/** What {@link prepareDatabase} sets up. */
export type PrepareDatabaseOptions = {
  seed: SeedLevel;
  /** Drop the database first and create it again — a local server only. */
  reset?: boolean;
  /**
   * Turn on the local logins `.env.local` connects as and write them there. The commands do; the
   * test harness never writes `.env.local`.
   */
  enableLocalLogins: boolean;
  /** Clone the prepared database this many times, one per test worker (`<database>_worker_<n>`). */
  workerDatabases?: number;
  /** Environment for the migration child; this process's when unset. */
  migrationEnvironment?: NodeJS.ProcessEnv;
  /** `inherit` shows the migration child's output; `pipe` keeps it for the error when it fails. */
  migrationOutput?: 'inherit' | 'pipe';
  /** Where each step reports; silent when unset. */
  log?: (line: string) => void;
};

/**
 * The database a step connects to as the migrating login: `DATABASE_MIGRATION_URL`, else
 * `DATABASE_URL` — the same precedence as the migration runner.
 */
function migrationUrl(): string {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL or DATABASE_URL must be set');
  return url;
}

/** The server's `postgres` database at `url`'s host, with `url`'s login, and `url`'s database name. */
function serverAndDatabase(url: string): { serverUrl: string; database: string } {
  const server = new URL(url);
  const database = decodeURIComponent(server.pathname.slice(1));
  server.pathname = '/postgres';
  return { serverUrl: server.toString(), database };
}

/** Runs `work` on a client connected to `url`'s server (its `postgres` database). */
async function onServer<T>(options: {
  url: string;
  work: (client: pg.Client) => Promise<T>;
}): Promise<T> {
  const client = new pg.Client({ connectionString: serverAndDatabase(options.url).serverUrl });
  client.on('error', () => undefined);
  await client.connect();
  try {
    return await options.work(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Step 1 — creates the database when it does not exist, after dropping it under `reset`.
 *
 * @remarks
 * A local server only (`isLocalDatabaseUrl`: this machine, or a CI runner's own service
 * container): a remote database is created by its provider, and is never dropped. A concurrent
 * run that created it first (`42P04 duplicate_database`) counts as success.
 */
export async function createDatabase(options: { url: string; reset: boolean }): Promise<string> {
  if (!isLocalDatabaseUrl(options.url)) return 'skipped (not a local server)';
  const { database } = serverAndDatabase(options.url);
  return onServer({
    url: options.url,
    work: async (client) => {
      const name = client.escapeIdentifier(database);
      if (options.reset) await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
        database,
      ]);
      if (existing.rowCount !== 0) return `${database} exists`;
      try {
        await client.query(`CREATE DATABASE ${name}`);
      } catch (error) {
        if ((error as { code?: string }).code !== '42P04') throw error;
      }
      return options.reset ? `${database} dropped and created` : `${database} created`;
    },
  });
}

/** Step 2 — applies the pending migrations in a child process (the runner exits when done). */
function migrate(
  options: Pick<PrepareDatabaseOptions, 'migrationEnvironment' | 'migrationOutput'>,
): string {
  const output = options.migrationOutput ?? 'inherit';
  const { command, args } = migrationCommand();
  const result = spawnSync(command, [...args], {
    stdio: output === 'inherit' ? 'inherit' : 'pipe',
    encoding: 'utf8',
    env: options.migrationEnvironment ?? process.env,
  });
  if (result.status !== 0) {
    const detail = output === 'pipe' ? `\n${result.stdout ?? ''}${result.stderr ?? ''}` : '';
    throw new Error(`migrations failed (exit ${result.status ?? 'signal'})${detail}`);
  }
  return 'every migration applied';
}

/**
 * Step 3 — turns on the local logins and points this process at them, so the seed connects the
 * way the app will.
 */
async function enableLogins(): Promise<string> {
  const outcome = await enableLocalDatabaseLogins();
  if (outcome.status === 'failed') throw new Error(`database logins failed: ${outcome.detail}`);
  for (const [envKey, url] of Object.entries(outcome.urls)) process.env[envKey] = url;
  return `${outcome.status}: ${outcome.detail}`;
}

/**
 * Step 4 — seeds up to `level`, in this process.
 *
 * @remarks
 * The seeds and the database pool are imported only now, so they read the URLs the steps above
 * settled; the seed URL rule (`seed-runtime-url.ts`: the operator login when one is set) applies
 * first. The pool is drained before returning.
 */
async function seed(level: Exclude<SeedLevel, 'none'>): Promise<string> {
  await import('@/scripts/seed/seed-runtime-url.js');
  const { closeDatabase } = await import('@/infrastructure/database/connection.js');
  try {
    if (level === 'permissions') {
      const { seedPermissions } = await import(
        '@/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.js'
      );
      await seedPermissions();
    } else if (level === 'minimal') {
      const { runMinimalSeed } = await import('@/scripts/seed/minimal.js');
      await runMinimalSeed();
    } else {
      const { runFullSeed } = await import('@/scripts/seed/full.js');
      await runFullSeed();
    }
    return 'rows upserted';
  } finally {
    await closeDatabase();
  }
}

/**
 * Step 5 — one clone of the prepared database per test worker: `<database>_worker_<n>`.
 *
 * @remarks
 * Each clone is dropped (`WITH (FORCE)`) and created again from the prepared database as its
 * template, so every worker starts from the same schema, policies, grants and seeded rows. The
 * template must have no open connection (`55006`): every step above closes its own first.
 */
export async function cloneForWorkers(options: { url: string; count: number }): Promise<string> {
  const { database } = serverAndDatabase(options.url);
  return onServer({
    url: options.url,
    work: async (client) => {
      const template = client.escapeIdentifier(database);
      for (let worker = 1; worker <= options.count; worker += 1) {
        const clone = client.escapeIdentifier(
          workerDatabaseName({ database, worker: String(worker) }),
        );
        await client.query(`DROP DATABASE IF EXISTS ${clone} WITH (FORCE)`);
        await client.query(`CREATE DATABASE ${clone} TEMPLATE ${template}`);
      }
      return `${options.count} worker database(s) from ${database}`;
    },
  });
}

/**
 * Sets up the database `DATABASE_MIGRATION_URL` (else `DATABASE_URL`) names: create → migrate →
 * logins → seed → worker databases.
 *
 * @remarks
 * - **Algorithm:** each step runs when its options and the database ask for it — create on a local
 *   server, logins when `enableLocalLogins`, seed unless `none`, clones when `workerDatabases` > 0.
 *   Re-running is safe: an existing database is kept, applied migrations are skipped, logins keep
 *   their passwords and the seeds upsert.
 * - **Failure modes:** throws on the first failing step, naming it.
 * - **Side effects:** may create or drop databases, run migrations, alter role logins and rewrite
 *   `.env.local` (logins), and insert seed rows.
 */
export async function prepareDatabase(options: PrepareDatabaseOptions): Promise<void> {
  const log = options.log ?? (() => undefined);
  const url = migrationUrl();
  const step = async ({ name, work }: { name: string; work: () => Promise<string> }) => {
    const startedAt = performance.now();
    try {
      const detail = await work();
      const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
      log(`✓ ${name} — ${detail} (${seconds}s)`);
    } catch (error) {
      throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  await step({
    name: 'create',
    work: () => createDatabase({ url, reset: options.reset ?? false }),
  });
  await step({ name: 'migrate', work: async () => migrate(options) });
  if (options.enableLocalLogins) await step({ name: 'logins', work: enableLogins });
  const level = options.seed;
  if (level !== 'none') await step({ name: `seed ${level}`, work: () => seed(level) });
  const count = options.workerDatabases ?? 0;
  if (count > 0) {
    await step({ name: 'worker databases', work: () => cloneForWorkers({ url, count }) });
  }
}

/** `pnpm db:migrate` / `db:seed` / `db:seed:full`: `--seed <level>` and `--reset`. */
async function main(): Promise<void> {
  await import('@/shared/config/load-env-files.js');
  const { values } = parseCommandLine({
    args: process.argv.slice(2),
    options: { seed: { type: 'string' }, reset: { type: 'boolean' } },
  });
  const seed = values.seed ?? 'none';
  const level = SEED_LEVELS.find((candidate) => candidate === seed);
  if (!level) throw new Error(`--seed must be one of ${SEED_LEVELS.join(', ')}`);
  await prepareDatabase({
    seed: level,
    reset: values.reset ?? false,
    enableLocalLogins: true,
    log: (line) => process.stdout.write(`${line}\n`),
  });
}

if (isMain(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      process.stderr.write(`✗ ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
