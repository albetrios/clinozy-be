/**
 * The smoke both restore drills run on the restored copy, after `pnpm db:migrate` and
 * `pnpm db:sequences:advance` — and the check after a real restore (docs/process/dr-runbook.md).
 * It never deletes or truncates anything: the restored copy holds production's data.
 *
 * Checks, in order: every migration file is applied; every table in the app's schemas reads; every
 * bigint id sequence is ahead of the ids in its column; then the app boots on the copy and a new
 * user signs in by email code, reads `/auth/me/context` and logs out. That user is the only row it
 * writes — the drill deletes its throwaway branch next.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... TEST_MODE=true CAPTCHA_PROVIDER=disabled pnpm db:restore:smoke
 *                                                         # a drill's throwaway copy
 *   DATABASE_URL=postgresql://... pnpm db:restore:smoke --database-only     # a real restore
 *
 * `TEST_MODE=true` makes `send-code` return the code (forbidden in production by the env schema).
 * `--database-only` stops after the database checks: a real restore is live, and gets no drill user.
 * Run it as the database owner, which bypasses row-level security (see
 * {@link findSequencesBehindTheirIds}).
 * Output names tables and sequences but never a row count or an id: the drill's logs are public.
 */
import '@/shared/config/load-env-files.js';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import {
  resolveDatabaseSsl,
  withoutSslQueryParameters,
} from '@/infrastructure/database/utils/connection-url.util.js';
import {
  appSchema,
  auditSchema,
  authSchema,
  billingSchema,
  notifySchema,
  tenancySchema,
  uploadSchema,
} from '@/infrastructure/database/pg-schemas.js';
import {
  buildPublicApiPrefix,
  PUBLIC_API_VERSION_SEGMENT_V1,
} from '@/shared/utils/http/api-versioning.util.js';
import { isMain, parseCommandLine } from '@tooling/setup/common/script.js';

/** Every schema the app's tables live in: `public` (the migration ledger, permissions) and each `pgSchema`. */
export const RESTORE_SMOKE_SCHEMA_NAMES: readonly string[] = [
  'public',
  ...[
    authSchema,
    tenancySchema,
    billingSchema,
    notifySchema,
    auditSchema,
    uploadSchema,
    appSchema,
  ].map((schema) => schema.schemaName),
];

/** A table {@link findUnreadableTables} could not read, with the SQLSTATE that refused it. */
export interface UnreadableTable {
  tableName: string;
  errorCode: string;
}

/** A sequence {@link findSequencesBehindTheirIds} found below the largest id in its column. */
export interface SequenceBehindItsIds {
  sequenceName: string;
  columnName: string;
}

/**
 * The migration files the restored database has not recorded in `public.schema_migrations`.
 *
 * @remarks
 * - **Why:** `pnpm db:migrate` runs just before; a file still missing means the copy is not on the
 *   schema the code expects.
 * - **Failure modes:** a missing ledger table throws (`42P01`) — the copy is not this app's database.
 * - **Side effects:** one read.
 * - **Notes:** a ledger row with no file (an old, consolidated migration) is not a failure.
 */
export async function findUnappliedMigrations(options: {
  client: pg.ClientBase;
  migrationFileNames: readonly string[];
}): Promise<string[]> {
  const { client, migrationFileNames } = options;
  const { rows } = await client.query<{ filename: string }>(
    'SELECT filename FROM public.schema_migrations',
  );
  const appliedFileNames = new Set(rows.map((row) => row.filename));
  return migrationFileNames.filter((fileName) => !appliedFileNames.has(fileName)).sort();
}

/**
 * The tables in `schemaNames` that a one-row read fails on.
 *
 * @remarks
 * - **Why:** a point-in-time branch restores every table's storage; reading one row from each
 *   proves the tables are there and this role may read them.
 * - **Algorithm:** lists `pg_tables`, then `SELECT 1 … LIMIT 1` per table; a refusal is recorded
 *   with its SQLSTATE and the pass moves on.
 * - **Failure modes:** none of its own — each refusal is returned, not thrown.
 * - **Side effects:** reads only; under row-level security a role that does not bypass it reads no
 *   rows without an error, which still counts as readable.
 */
export async function findUnreadableTables(options: {
  client: pg.ClientBase;
  schemaNames: readonly string[];
}): Promise<UnreadableTable[]> {
  const { client, schemaNames } = options;
  const { rows: tables } = await client.query<{ table_name: string }>(
    `
    SELECT format('%I.%I', schemaname, tablename) AS table_name
    FROM pg_tables
    WHERE schemaname = ANY($1::text[])
    ORDER BY schemaname, tablename
  `,
    [[...schemaNames]],
  );

  const unreadableTables: UnreadableTable[] = [];
  for (const table of tables) {
    try {
      await client.query(`SELECT 1 FROM ${table.table_name} LIMIT 1`);
    } catch (error) {
      unreadableTables.push({
        tableName: table.table_name,
        errorCode: (error as { code?: string }).code ?? 'unknown',
      });
    }
  }
  return unreadableTables;
}

/**
 * The bigint id sequences in `schemaNames` that would hand out an id already in their column.
 *
 * @remarks
 * - **Why:** the next insert takes the sequence's next value; below the largest id it would
 *   collide with a restored row. `pnpm db:sequences:advance` moves each one far ahead, so this
 *   proves that step ran.
 * - **Algorithm:** pairs each sequence with the column that owns it (`pg_depend`: `a` for serial,
 *   `i` for identity), then flags a `last_value` below `max(column)`. A null `last_value` (never
 *   used, or reset with `is_called = false`) counts as 0, so it passes only on an empty column.
 * - **Failure modes:** throws when the role cannot read a sequence — its `last_value` reads as
 *   null, which would look like 0.
 * - **Side effects:** reads only. Run as a role that bypasses row-level security (the drill's
 *   database owner does): under it `max()` would see only the rows a policy lets through.
 */
export async function findSequencesBehindTheirIds(options: {
  client: pg.ClientBase;
  schemaNames: readonly string[];
}): Promise<SequenceBehindItsIds[]> {
  const { client, schemaNames } = options;
  const { rows: sequences } = await client.query<{
    sequence_name: string;
    column_name: string;
    table_name: string;
    quoted_column_name: string;
    last_value: string | null;
    is_readable: boolean;
  }>(
    `
    SELECT
      format('%I.%I', sequence_namespace.nspname, sequence_class.relname) AS sequence_name,
      format('%I.%I.%I', table_namespace.nspname, table_class.relname, attribute.attname) AS column_name,
      format('%I.%I', table_namespace.nspname, table_class.relname) AS table_name,
      quote_ident(attribute.attname) AS quoted_column_name,
      sequence_row.last_value::text AS last_value,
      has_sequence_privilege(sequence_class.oid, 'SELECT') AS is_readable
    FROM pg_sequences AS sequence_row
    JOIN pg_namespace AS sequence_namespace ON sequence_namespace.nspname = sequence_row.schemaname
    JOIN pg_class AS sequence_class
      ON sequence_class.relnamespace = sequence_namespace.oid
     AND sequence_class.relname = sequence_row.sequencename
    JOIN pg_depend AS dependency
      ON dependency.classid = 'pg_class'::regclass
     AND dependency.objid = sequence_class.oid
     AND dependency.refclassid = 'pg_class'::regclass
     AND dependency.deptype IN ('a', 'i')
    JOIN pg_class AS table_class ON table_class.oid = dependency.refobjid
    JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = table_class.oid
     AND attribute.attnum = dependency.refobjsubid
    WHERE sequence_row.schemaname = ANY($1::text[])
      AND sequence_row.data_type = 'bigint'::regtype
    ORDER BY sequence_name
  `,
    [[...schemaNames]],
  );

  const unreadableSequenceNames = sequences
    .filter((sequence) => !sequence.is_readable)
    .map((sequence) => sequence.sequence_name);
  if (unreadableSequenceNames.length > 0) {
    throw new Error(
      `Cannot read ${unreadableSequenceNames.join(', ')} — run as the database owner the drill logs in as.`,
    );
  }

  const sequencesBehind: SequenceBehindItsIds[] = [];
  for (const sequence of sequences) {
    const {
      rows: [largest],
    } = await client.query<{ largest_id: string | null }>(
      `SELECT max(${sequence.quoted_column_name})::text AS largest_id FROM ${sequence.table_name}`,
    );
    const largestId = BigInt(largest?.largest_id ?? '0');
    const sequenceValue = BigInt(sequence.last_value ?? '0');
    if (sequenceValue < largestId) {
      sequencesBehind.push({
        sequenceName: sequence.sequence_name,
        columnName: sequence.column_name,
      });
    }
  }
  return sequencesBehind;
}

/**
 * Boots the app on the restored database and signs a new user in and out by email code.
 *
 * @remarks
 * - **Why:** the database checks prove the data is there; this proves the app can serve it —
 *   boot, readiness (Postgres, Redis, the job broker), a write (sign-up, session), an
 *   authenticated read and a logout.
 * - **Algorithm:** `GET /readyz` → `POST /auth/email/send-code` (a new `restore-drill-…@example.com`
 *   address) → `POST /auth/email/login` with the code `TEST_MODE` returns → `GET /auth/me/context`
 *   → `POST /auth/logout`, all in-process through `app.inject`.
 * - **Failure modes:** throws naming the step and its HTTP status; never prints a response body.
 * - **Side effects:** writes the drill user and its session; queues its sign-in email in Redis,
 *   which no worker sends. `app.close()` closes the database pool and the Redis clients.
 * - **Notes:** `@/app.js` is imported here, not at the top, so the database checks above load
 *   without the whole app.
 */
export async function runSignInRoundTrip(): Promise<void> {
  const [{ buildApp }, { connectRedis }, { connectBullMqRedis }] = await Promise.all([
    import('@/app.js'),
    import('@/infrastructure/cache/redis.client.js'),
    import('@/infrastructure/cache/bullmq-redis.client.js'),
  ]);
  await connectRedis();
  await connectBullMqRedis();
  const app = await buildApp();
  await app.ready();

  const apiPrefix = buildPublicApiPrefix(PUBLIC_API_VERSION_SEGMENT_V1);
  const email = `restore-drill-${randomUUID()}@example.com`;
  try {
    const expectOk = ({ step, statusCode }: { step: string; statusCode: number }): void => {
      if (statusCode !== 200) throw new Error(`${step} answered ${String(statusCode)}, not 200`);
    };

    expectOk({
      step: 'GET /readyz',
      statusCode: (await app.inject({ method: 'GET', url: '/readyz' })).statusCode,
    });

    const sendCode = await app.inject({
      method: 'POST',
      url: `${apiPrefix}/auth/email/send-code`,
      payload: { email },
    });
    expectOk({ step: 'POST /auth/email/send-code', statusCode: sendCode.statusCode });
    const code = (sendCode.json() as { data?: { debug_verification_code?: string } }).data
      ?.debug_verification_code;
    if (!code) {
      throw new Error('POST /auth/email/send-code returned no code — run with TEST_MODE=true');
    }

    const login = await app.inject({
      method: 'POST',
      url: `${apiPrefix}/auth/email/login`,
      payload: { email, code },
    });
    expectOk({ step: 'POST /auth/email/login', statusCode: login.statusCode });
    const accessToken = (login.json() as { data?: { access_token?: string } }).data?.access_token;
    if (!accessToken) throw new Error('POST /auth/email/login returned no access token');
    const authorization = { authorization: `Bearer ${accessToken}` };

    expectOk({
      step: 'GET /auth/me/context',
      statusCode: (
        await app.inject({
          method: 'GET',
          url: `${apiPrefix}/auth/me/context`,
          headers: authorization,
        })
      ).statusCode,
    });

    const cookies = Object.fromEntries(
      login.cookies.map((cookie) => [cookie.name, cookie.value] as const),
    );
    expectOk({
      step: 'POST /auth/logout',
      statusCode: (
        await app.inject({
          method: 'POST',
          url: `${apiPrefix}/auth/logout`,
          headers: authorization,
          cookies,
        })
      ).statusCode,
    });
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const databaseOnly =
    parseCommandLine({
      args: process.argv.slice(2),
      options: { 'database-only': { type: 'boolean' } },
    }).values['database-only'] === true;
  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: withoutSslQueryParameters(connectionUrl),
    ssl: resolveDatabaseSsl({
      databaseUrl: connectionUrl,
      sslEnabledByDefault: false,
      rejectUnauthorizedOverride: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true',
    }),
    connectionTimeoutMillis: 15_000,
  });
  client.on('error', (error) => console.error('Database connection error', error));
  await client.connect();
  const failures: string[] = [];
  try {
    const migrationFileNames = (await readdir(resolve(process.cwd(), 'migrations'))).filter(
      (fileName) => fileName.endsWith('.sql'),
    );
    const unappliedMigrations = await findUnappliedMigrations({ client, migrationFileNames });
    if (unappliedMigrations.length > 0) {
      failures.push(`Migrations not applied: ${unappliedMigrations.join(', ')}`);
    } else {
      console.log(`Migrations: all ${String(migrationFileNames.length)} applied.`);
    }

    const unreadableTables = await findUnreadableTables({
      client,
      schemaNames: RESTORE_SMOKE_SCHEMA_NAMES,
    });
    if (unreadableTables.length > 0) {
      failures.push(
        `Tables that do not read: ${unreadableTables
          .map((table) => `${table.tableName} (${table.errorCode})`)
          .join(', ')}`,
      );
    } else {
      console.log('Tables: every table reads.');
    }

    const sequencesBehind = await findSequencesBehindTheirIds({
      client,
      schemaNames: RESTORE_SMOKE_SCHEMA_NAMES,
    });
    if (sequencesBehind.length > 0) {
      failures.push(
        `Id sequences not past their ids (run pnpm db:sequences:advance): ${sequencesBehind
          .map((sequence) => `${sequence.sequenceName} → ${sequence.columnName}`)
          .join(', ')}`,
      );
    } else {
      console.log('Id sequences: every one is past the ids in its column.');
    }
  } finally {
    await client.end();
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
  if (databaseOnly) return;

  await runSignInRoundTrip();
  console.log(
    'Sign-in round trip: readyz → send-code → email login → me/context → logout all answered 200.',
  );
  // The booted app leaves timers behind after `app.close()`; the drill step must still end.
  process.exit(0);
}

if (isMain(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
