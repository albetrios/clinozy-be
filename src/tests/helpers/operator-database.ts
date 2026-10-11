import type pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  buildPostgresOptions,
  createDatabasePool,
  database,
  pool,
} from '@/infrastructure/database/connection.js';

let operatorPool: pg.Pool | undefined;
let operatorDatabaseHandle: ReturnType<typeof drizzle> | undefined;

/**
 * `DATABASE_OPERATOR_URL`, when it points somewhere other than the pool under test.
 *
 * @remarks
 * The two only diverge under `pnpm test:rls-role`, where `src/tests/setup.ts` re-opens
 * `DATABASE_URL` as the RLS-subject `clinozy_be_app` role and keeps the operator URL for the
 * harness. Everywhere else they are the same connection — locally `setup.ts` already points
 * `DATABASE_URL` at the operator, and CI connects as the superuser directly — so there is no
 * second pool to open.
 */
function distinctOperatorUrl(): string | undefined {
  const operatorUrl = process.env.DATABASE_OPERATOR_URL;
  if (!operatorUrl || operatorUrl === process.env.DATABASE_URL) return undefined;
  return operatorUrl;
}

/**
 * node-postgres pool on the operator connection, for harness work that needs a raw client the
 * application role may not use (holding a lock across statements, terminating a backend).
 *
 * @remarks
 * A lazily-created pool on a separate URL, built with the same {@link buildPostgresOptions} as
 * `getMaintenanceDatabase()` in `connection.ts`, falling back to the shared {@link pool} when no
 * distinct URL is configured. So outside the RLS lane this returns the existing pool and
 * nothing changes.
 */
export function getOperatorPool(): pg.Pool {
  const operatorUrl = distinctOperatorUrl();
  if (!operatorUrl) return pool;
  if (operatorPool === undefined) {
    operatorPool = createDatabasePool({
      config: buildPostgresOptions(operatorUrl),
      poolName: 'operator',
    });
  }
  return operatorPool;
}

/**
 * Drizzle handle on the operator connection, for fixture setup.
 *
 * @remarks
 * - **Why:** under `pnpm test:rls-role` the pool under test is `clinozy_be_app`, which is subject
 *   to row-level security. Fixtures seed preconditions — often deliberately cross-tenant ones —
 *   and the harness truncates every table between suites; neither is something the application
 *   role may do. Seed on the operator, assert through the application's own pool.
 * - **Algorithm:** the shared {@link database} when there is no distinct operator URL, otherwise
 *   a lazily-created Drizzle handle over {@link getOperatorPool}. Raw statements (`cleanupDatabase`'s
 *   TRUNCATE, a fixture's DELETE) go through its `execute(sql`...`)`.
 * - **Notes:** the two root factories, `user.factory.ts` and `organization.factory.ts`,
 *   deliberately insert through the application's own context instead — for the tables every
 *   other fixture hangs off, "can this row be created the way production creates it" is itself
 *   worth asserting.
 */
export function getOperatorDatabase(): ReturnType<typeof drizzle> {
  if (!distinctOperatorUrl()) return database;
  if (operatorDatabaseHandle === undefined) {
    operatorDatabaseHandle = drizzle({ client: getOperatorPool() });
  }
  return operatorDatabaseHandle;
}

/** A query runner on one operator connection: a tagged template plus `unsafe(text, values)`. */
export type OperatorQuery = (<Rows extends readonly unknown[] = Record<string, unknown>[]>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Rows>) & {
  unsafe: <Rows extends readonly unknown[] = Record<string, unknown>[]>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<Rows>;
};

/** The template's text with each interpolated value as a `$n` bound parameter. */
function toParameterizedQuery(
  strings: TemplateStringsArray,
  values: readonly unknown[],
): { text: string; values: unknown[] } {
  let text = strings[0] ?? '';
  for (let index = 0; index < values.length; index += 1) {
    text += `$${index + 1}${strings[index + 1] ?? ''}`;
  }
  return { text, values: [...values] };
}

function bindOperatorQuery(runner: Pick<pg.Pool | pg.PoolClient, 'query'>): OperatorQuery {
  const query = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
    (await runner.query(toParameterizedQuery(strings, values))).rows) as OperatorQuery;
  query.unsafe = (async (text: string, values?: readonly unknown[]) =>
    (await runner.query(text, values ? [...values] : undefined)).rows) as OperatorQuery['unsafe'];
  return query;
}

/**
 * Raw SQL on the operator connection — `${value}`s are bound parameters (an array binds as a
 * Postgres array, so `= ANY(${ids})` works) and the answer is the rows.
 *
 * @remarks
 * - **Why:** fixtures and assertions that read or write what the application role may not (another
 *   tenant's rows, a column the API never exposes) without a Drizzle schema in reach.
 * - **Notes:** each statement runs on its own pooled connection; use
 *   {@link withOperatorTransaction} when statements must share one (`SET LOCAL`, a lock).
 */
export const operatorQuery = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) =>
    bindOperatorQuery(getOperatorPool())(strings, ...values),
  {
    unsafe: (text: string, values?: readonly unknown[]) =>
      bindOperatorQuery(getOperatorPool()).unsafe(text, values),
  },
) as OperatorQuery;

/**
 * Runs `callback` in one transaction on one operator connection, committed when it resolves and
 * rolled back when it throws.
 */
export async function withOperatorTransaction<Result>(
  callback: (transaction: OperatorQuery) => Promise<Result>,
): Promise<Result> {
  const client = await getOperatorPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(bindOperatorQuery(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
