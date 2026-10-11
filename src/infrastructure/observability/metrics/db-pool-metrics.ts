import { sql as drizzleSql } from 'drizzle-orm';
import { database, readDatabasePoolStatistics } from '@/infrastructure/database/connection.js';
import { resolvePostgresAllowedApplicationConnections } from '@/infrastructure/database/safety/assert-connection-budget.js';
import { registerOrganizationRlsCheckoutHoldObserver } from '@/infrastructure/database/pool/organization-rls-checkout-counter.js';
import { registerUnscopedDatabaseAccessObserver } from '@/infrastructure/database/pool/unscoped-query-counter.js';
import { getEnv } from '@/shared/config/env.config.js';
import { isMetricsEnabled } from '@/infrastructure/observability/metrics/metrics-registry.js';
import {
  evaluatePoolExhaustionAndAlert,
  resetPoolExhaustionAlertStateForTests,
} from '@/infrastructure/observability/dlq-depth/db-pool-alert.service.js';
import {
  recordOrganizationRlsCheckoutHold,
  recordUnscopedDatabaseQuery,
  setOrganizationRlsActiveCheckouts,
  setPostgresPoolConnectionCounts,
  setPostgresPoolStatistics,
} from '@/infrastructure/observability/metrics/prometheus-metrics.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

type PoolState = 'active' | 'idle' | 'waiting';

type PoolCountRow = {
  state: PoolState;
  count: number;
};

/**
 * Samples connection counts from pg_stat_activity for the current database user.
 * Approximates pool utilization from the server's side of every connection this role holds.
 */
async function samplePostgresPoolConnectionCounts(): Promise<PoolCountRow[]> {
  const result = await database.execute<{ state: string; count: string }>(drizzleSql`
    SELECT
      CASE
        WHEN state = 'active' THEN 'active'
        WHEN state = 'idle' THEN 'idle'
        ELSE 'waiting'
      END AS state,
      COUNT(*)::text AS count
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND usename = current_user
      AND pid <> pg_backend_pid()
    GROUP BY 1
  `);
  const rows = Array.isArray(result)
    ? (result as { state: string; count: string }[])
    : ((result as { rows?: { state: string; count: string }[] }).rows ?? []);

  const counts: Record<PoolState, number> = { active: 0, idle: 0, waiting: 0 };
  for (const row of rows) {
    const state = row.state as PoolState;
    if (state in counts) {
      // eslint-disable-next-line security/detect-object-injection -- state checked via `state in counts` (typed PoolState).
      counts[state] = Number.parseInt(row.count, 10) || 0;
    }
  }

  return (['active', 'idle', 'waiting'] as const).map((state) => ({
    state,
    // eslint-disable-next-line security/detect-object-injection -- state is a typed PoolState constant.
    count: counts[state],
  }));
}

function sumClusterActiveConnections(samples: ReadonlyArray<PoolCountRow>): number {
  const active = samples.find((sample) => sample.state === 'active')?.count ?? 0;
  const waiting = samples.find((sample) => sample.state === 'waiting')?.count ?? 0;
  return active + waiting;
}

let cachedAllowedApplicationConnections: number | null = null;

async function resolveAllowedApplicationConnectionsCached(): Promise<number> {
  if (cachedAllowedApplicationConnections !== null) {
    return cachedAllowedApplicationConnections;
  }
  try {
    cachedAllowedApplicationConnections = await resolvePostgresAllowedApplicationConnections();
    return cachedAllowedApplicationConnections;
  } catch (error) {
    logger.warn({ error }, 'database.pool.allowed_connections.resolve_failed');
    return 0;
  }
}

/** Pool gauge refresh and exhaustion alert interval (default from env). */
export function resolvePostgresPoolPollIntervalMs(): number {
  return getEnv().DATABASE_POOL_ALERT_POLL_INTERVAL_MS;
}

let poolMonitoringInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Reads this process's live pool counts from node-postgres and the role's cluster-wide
 * connection states from `pg_stat_activity`, updates the `postgres_pool_*` /
 * `db_pool_connections` gauges, and feeds both into {@link evaluatePoolExhaustionAndAlert}.
 * A failed `pg_stat_activity` sample falls back to all-zero cluster counts so the alerter still
 * runs (and may flip to `ok`); the live pool counts need no query and are always there.
 */
export async function refreshPostgresPoolMetrics(): Promise<void> {
  const poolStatistics = readDatabasePoolStatistics();
  let samples: PoolCountRow[] = [];

  try {
    samples = await samplePostgresPoolConnectionCounts();
  } catch (error) {
    logger.warn({ error }, 'metrics.postgres_pool.sample_failed');
    samples = (['active', 'idle', 'waiting'] as const).map((state) => ({ state, count: 0 }));
  }

  if (isMetricsEnabled()) {
    setPostgresPoolConnectionCounts(samples);
    setPostgresPoolStatistics(poolStatistics);
  }

  const allowedApplicationConnections = await resolveAllowedApplicationConnectionsCached();
  const clusterActiveConnections = sumClusterActiveConnections(samples);
  const pressureSample = evaluatePoolExhaustionAndAlert({
    clusterActiveConnections,
    allowedApplicationConnections,
    poolStatistics,
  });

  if (isMetricsEnabled()) {
    setOrganizationRlsActiveCheckouts(pressureSample.activeOrganizationRlsCheckouts);
  }
}

/**
 * Schedules the recurring {@link refreshPostgresPoolMetrics} timer used by the
 * metrics scrape path. Idempotent — repeat calls do not stack intervals.
 */
export function registerPostgresPoolMetrics(): void {
  registerOrganizationRlsCheckoutHoldObserver((sample) => {
    recordOrganizationRlsCheckoutHold(sample);
  });

  // Every unscoped access is counted; only the FIRST sighting of a given call site is logged,
  // so a hot offender cannot flood the log while still being named once.
  registerUnscopedDatabaseAccessObserver((sample) => {
    recordUnscopedDatabaseQuery();
    if (sample.isNewCallSite) {
      logger.warn({ callSite: sample.callSite }, 'database.query.unscoped');
    }
  });

  if (poolMonitoringInterval) {
    return;
  }

  void refreshPostgresPoolMetrics();
  poolMonitoringInterval = setInterval(() => {
    void refreshPostgresPoolMetrics();
  }, resolvePostgresPoolPollIntervalMs());
}

/** Cancels the polling timer started by {@link registerPostgresPoolMetrics} (used on shutdown and in tests). */
export function stopPostgresPoolMetricsPolling(): void {
  if (poolMonitoringInterval) {
    clearInterval(poolMonitoringInterval);
    poolMonitoringInterval = null;
  }
}

/** Test-only: stop polling and reset alert consecutive counters. */
export function resetPostgresPoolMonitoringForTests(): void {
  stopPostgresPoolMetricsPolling();
  resetPoolExhaustionAlertStateForTests();
  registerOrganizationRlsCheckoutHoldObserver(null);
  cachedAllowedApplicationConnections = null;
}
