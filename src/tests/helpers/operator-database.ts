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
