import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { THIRTY_SECONDS_MS } from '@/shared/constants/ttl.constants.js';
import { env } from '@/shared/config/env.config.js';
import { getRemainingShutdownBudgetMs } from '@/infrastructure/queue/worker-runtime/shutdown-timing.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  resolveDatabaseSsl,
  withoutSslQueryParameters,
} from '@/infrastructure/database/utils/connection-url.util.js';

import {
  DEFAULT_DATABASE_POOL_CONNECT_TIMEOUT_SECONDS,
  DEFAULT_DATABASE_POOL_IDLE_TIMEOUT_SECONDS,
  DEFAULT_DATABASE_POOL_MAX,
  DEFAULT_DATABASE_POOL_MAX_LIFETIME_SECONDS,
} from '@/infrastructure/database/pool/pool.constants.js';

export { DEFAULT_DATABASE_POOL_MAX };

/**
 * Builds the node-postgres pool config for `databaseUrl`: TLS decided from the URL's `sslmode`
 * (and tightened by `DATABASE_SSL_REJECT_UNAUTHORIZED`), the per-connection `statement_timeout` /
 * `idle_in_transaction_session_timeout` / `lock_timeout`, and pool sizing.
 *
 * @remarks
 * The TLS query parameters are removed from the connection string the pool receives: node-postgres
 * would otherwise read them over `ssl` (see {@link withoutSslQueryParameters}).
 */
export function buildPostgresOptions(databaseUrl: string): pg.PoolConfig {
  const ssl = resolveDatabaseSsl({
    databaseUrl,
    sslEnabledByDefault: env.DATABASE_SSL_ENABLED,
    rejectUnauthorizedOverride: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
  });

  /**
   * HTTP handlers use scoped RLS contexts (short transactions per unit-of-work), so the
   * connection-level `statement_timeout` must cap runaway queries on autocommit paths
   * (default 5s via `DATABASE_HTTP_STATEMENT_TIMEOUT_MS`).
   */
  const connectionStatementTimeoutMs =
    env.DATABASE_HTTP_STATEMENT_TIMEOUT_MS > 0
      ? env.DATABASE_HTTP_STATEMENT_TIMEOUT_MS
      : (env.DATABASE_STATEMENT_TIMEOUT_MS ?? THIRTY_SECONDS_MS);
  const idleInTransactionTimeoutMs =
    env.DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS ?? THIRTY_SECONDS_MS;

  /**
   * The three timeouts catch three different failures and do not substitute for one another:
   * `statement_timeout` a runaway query, `idle_in_transaction_session_timeout` an abandoned
   * transaction, and `lock_timeout` a statement waiting behind someone else's lock. A lock waiter
   * is neither idle nor executing, so without `lock_timeout` it holds its pooled connection for an
   * unbounded wait and concurrent waiters turn lock contention into pool exhaustion.
   */
  return {
    connectionString: withoutSslQueryParameters(databaseUrl),
    ssl,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis:
      (env.DATABASE_POOL_IDLE_TIMEOUT_SECONDS ?? DEFAULT_DATABASE_POOL_IDLE_TIMEOUT_SECONDS) *
      1_000,
    connectionTimeoutMillis:
      (env.DATABASE_POOL_CONNECT_TIMEOUT_SECONDS ?? DEFAULT_DATABASE_POOL_CONNECT_TIMEOUT_SECONDS) *
      1_000,
    maxLifetimeSeconds:
      env.DATABASE_POOL_MAX_LIFETIME_SECONDS ?? DEFAULT_DATABASE_POOL_MAX_LIFETIME_SECONDS,
    statement_timeout: connectionStatementTimeoutMs,
    idle_in_transaction_session_timeout: idleInTransactionTimeoutMs,
    lock_timeout: env.DATABASE_LOCK_TIMEOUT_MS,
  };
}

/**
 * Creates a node-postgres pool whose connection errors are logged instead of thrown.
 *
 * @remarks
 * - **Why:** a node-postgres client whose connection drops (a failover, a network blip, a
 *   terminated backend) emits `error`; with no listener that is an uncaught exception, and the API
 *   and worker exit on one. The pool listens for its idle clients; each client also gets a listener
 *   when it connects, which covers one checked out inside a transaction. The pending query still
 *   rejects, and the pool discards the broken client.
 * - **Side effects:** a `warn` log per dropped connection.
 */
export function createDatabasePool({
  config,
  poolName,
}: {
  config: pg.PoolConfig;
  poolName: string;
}): pg.Pool {
  const pool = new pg.Pool(config);
  const logConnectionError = (error: Error) =>
    logger.warn({ error, pool: poolName }, 'database.connection.error');
  pool.on('error', logConnectionError);
  pool.on('connect', (client) => client.on('error', logConnectionError));
  return pool;
}

/**
 * The process's primary node-postgres pool, on `DATABASE_URL` (the RLS-subject application role
 * in deployed environments). Managed Postgres (Neon, Railway) may close idle connections after
 * about five minutes; `idleTimeoutMillis` and `maxLifetimeSeconds` keep the pool ahead of that.
 */
export const pool = createDatabasePool({
  config: buildPostgresOptions(env.DATABASE_URL),
  poolName: 'primary',
});

/**
 * Process-wide Drizzle handle bound to the {@link pool} — the default database accessor for
 * repositories and ad-hoc queries when no request/worker context has pinned a transaction-scoped
 * handle in ALS.
 */
export const database = drizzle({ client: pool });

/**
 * Opens every connection of the {@link pool} before the server accepts traffic.
 *
 * @remarks
 * - **Algorithm:** issues `DATABASE_POOL_MAX` concurrent `SELECT 1` queries; the pool opens a
 *   connection per in-flight query up to `max`, so it is full when they resolve.
 * - **Failure modes:** best-effort per connection — during a rolling deploy the old replicas still
 *   hold theirs, and a refused connection (`max_connections`) used to fail the whole boot, so the new
 *   replica crash-looped. Now the ones that open stay, a warning names how many did not (the pool
 *   opens them on demand), and only a database that accepts none fails the boot.
 * - **Side effects:** up to `DATABASE_POOL_MAX` open connections until their idle timeout.
 * - **Notes:** without it a freshly started process opens its connections under its first burst,
 *   so the first requests pay the TCP + authentication handshakes while the event loop is
 *   busiest — the same startup race the eager Redis connect in `server.ts` avoids.
 */
export async function primeDatabasePool(
  openConnection: () => Promise<unknown> = () => pool.query('SELECT 1'),
): Promise<void> {
  const outcomes = await Promise.allSettled(
    Array.from({ length: env.DATABASE_POOL_MAX }, () => openConnection()),
  );
  const refused = outcomes.filter((outcome) => outcome.status === 'rejected');
  if (refused.length === 0) return;
  if (refused.length === outcomes.length) throw refused[0]!.reason;
  logger.warn(
    {
      opened: outcomes.length - refused.length,
      refused: refused.length,
      error: refused[0]!.reason,
    },
    'database.pool_prime.partial',
  );
}

let maintenancePool: pg.Pool | undefined;
let maintenanceDatabaseHandle: ReturnType<typeof drizzle> | undefined;

/**
 * Drizzle handle for maintenance (RLS-bypass) database contexts — a separate, lazily created
 * pool on `DATABASE_MAINTENANCE_URL`, connecting as the dedicated `clinozy_be_maintenance` role.
 *
 * @remarks
 * - **Notes:** bypass authority is a CONNECTION-level property: every bypass policy arm requires
 *   `current_user = 'clinozy_be_maintenance'` as well as its `app.*` GUC, so the arms only open
 *   on this pool. Provisioning steps: `docs/deployment/runbooks/maintenance-database-role.md`.
 *   The lazy pool uses the same tuned {@link buildPostgresOptions} as the primary pool, sized by
 *   `DATABASE_MAINTENANCE_POOL_MAX`.
 */
export function getMaintenanceDatabase(): ReturnType<typeof drizzle> {
  if (maintenanceDatabaseHandle === undefined) {
    maintenancePool = createDatabasePool({
      config: {
        ...buildPostgresOptions(env.DATABASE_MAINTENANCE_URL),
        // Its own, smaller size: short checkouts only, and it counts against max_connections too.
        max: env.DATABASE_MAINTENANCE_POOL_MAX,
      },
      poolName: 'maintenance',
    });
    maintenanceDatabaseHandle = drizzle({ client: maintenancePool });
  }
  return maintenanceDatabaseHandle;
}

/** One pool's live connection counts, as node-postgres keeps them. */
export interface DatabasePoolStatistics {
  /** `primary` (`DATABASE_URL`) or `maintenance` (`DATABASE_MAINTENANCE_URL`). */
  pool: 'primary' | 'maintenance';
  /** The pool's configured size. */
  maxConnections: number;
  /** Connections a unit of work holds now. */
  inUse: number;
  /** Open connections waiting in the pool for a unit of work. */
  idle: number;
  /** Units of work queued for a connection. */
  waiting: number;
}

/** {@link DatabasePoolStatistics} of one node-postgres pool. */
function describePool({
  name,
  target,
}: {
  name: DatabasePoolStatistics['pool'];
  target: pg.Pool;
}): DatabasePoolStatistics {
  return {
    pool: name,
    maxConnections: target.options.max ?? 0,
    inUse: target.totalCount - target.idleCount,
    idle: target.idleCount,
    waiting: target.waitingCount,
  };
}

/**
 * The live connection counts of this process's pools: the primary one, and the maintenance one
 * once it has been opened.
 *
 * @remarks
 * - **Algorithm:** node-postgres counts its own clients — `totalCount` open, `idleCount` idle,
 *   `waitingCount` checkouts queued for a client; in use is open minus idle. No query runs.
 * - **Side effects:** none — it never opens the lazy maintenance pool.
 * - **Notes:** read by the pool-metrics poll (`db-pool-metrics.ts`) for the
 *   `postgres_pool_*` gauges and the pool-exhaustion alert.
 */
export function readDatabasePoolStatistics(): DatabasePoolStatistics[] {
  const statistics = [describePool({ name: 'primary', target: pool })];
  if (maintenancePool !== undefined) {
    statistics.push(describePool({ name: 'maintenance', target: maintenancePool }));
  }
  return statistics;
}

/** Ends `target`, giving up once what is left of the shared shutdown budget has passed. */
async function endWithinShutdownBudget(target: pg.Pool): Promise<void> {
  let budgetTimer: NodeJS.Timeout | undefined;
  await Promise.race([
    target.end(),
    new Promise<void>((resolve) => {
      budgetTimer = setTimeout(resolve, getRemainingShutdownBudgetMs());
    }),
  ]);
  clearTimeout(budgetTimer);
}

/**
 * Drains the node-postgres pools within the shared shutdown drain budget
 * (`SHUTDOWN_TIMEOUT_MS`, 15s default). Called from the shutdown middleware.
 *
 * @remarks
 * `pool.end()` waits for every checked-out client to be released, and has no timeout of its own:
 * each pool is raced against what is left of the shared shutdown budget
 * ({@link getRemainingShutdownBudgetMs}), so the drain always ends inside the force-exit watchdog
 * (budget + buffer) however long the steps before it took.
 */
export async function closeDatabase(): Promise<void> {
  await endWithinShutdownBudget(pool);
  if (maintenancePool !== undefined) {
    await endWithinShutdownBudget(maintenancePool);
    maintenancePool = undefined;
    maintenanceDatabaseHandle = undefined;
  }
}
