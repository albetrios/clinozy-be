import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCacheForTests } from '@/shared/config/env.config.js';
import { resetMetricsRegistryForTests } from '@/infrastructure/observability/metrics/metrics-registry.js';

/**
 * The pool-metrics poll: node-postgres's live counts of this process's pools become the
 * `postgres_pool_*` gauges and travel with the pool-exhaustion evaluation.
 */
const POOL_STATISTICS = [
  { pool: 'primary' as const, maxConnections: 30, inUse: 12, idle: 3, waiting: 2 },
  { pool: 'maintenance' as const, maxConnections: 10, inUse: 1, idle: 4, waiting: 0 },
];

const evaluatePoolExhaustionAndAlert = vi.fn(() => ({ activeOrganizationRlsCheckouts: 0 }));

vi.mock('@/infrastructure/database/connection.js', () => ({
  database: { execute: vi.fn(async () => ({ rows: [] })) },
  readDatabasePoolStatistics: () => POOL_STATISTICS,
}));

vi.mock('@/infrastructure/database/safety/assert-connection-budget.js', () => ({
  resolvePostgresAllowedApplicationConnections: async () => 100,
}));

vi.mock('@/infrastructure/observability/dlq-depth/db-pool-alert.service.js', () => ({
  evaluatePoolExhaustionAndAlert,
  resetPoolExhaustionAlertStateForTests: vi.fn(),
}));

const captureMessage = vi.fn();

vi.mock('@/infrastructure/observability/sentry/sentry.js', () => ({ captureMessage }));

describe('postgres pool metrics poll', () => {
  const originalMetricsEnabled = process.env.METRICS_ENABLED;

  beforeEach(() => {
    vi.resetModules();
    process.env.METRICS_ENABLED = 'true';
    resetEnvCacheForTests();
    evaluatePoolExhaustionAndAlert.mockClear();
    captureMessage.mockClear();
  });

  afterEach(async () => {
    const { resetPostgresPoolMonitoringForTests } = await import(
      '@/infrastructure/observability/metrics/db-pool-metrics.js'
    );
    resetPostgresPoolMonitoringForTests();
    if (originalMetricsEnabled === undefined) {
      delete process.env.METRICS_ENABLED;
    } else {
      process.env.METRICS_ENABLED = originalMetricsEnabled;
    }
    resetEnvCacheForTests();
    resetMetricsRegistryForTests();
  });

  it("exports each pool's live counts under its own label", async () => {
    const { getMetricsRegistry } = await import(
      '@/infrastructure/observability/metrics/metrics-registry.js'
    );
    const { ensurePrometheusMetricsRegistered } = await import(
      '@/infrastructure/observability/metrics/prometheus-metrics.js'
    );
    const { refreshPostgresPoolMetrics } = await import(
      '@/infrastructure/observability/metrics/db-pool-metrics.js'
    );
    const { renderMetrics } = await import('@/infrastructure/observability/metrics/metrics.js');
    ensurePrometheusMetricsRegistered(getMetricsRegistry());

    await refreshPostgresPoolMetrics();
    const body = await renderMetrics();

    expect(body).toMatch(/postgres_pool_connections\{pool="primary",state="in_use"[^}]*\} 12/);
    expect(body).toMatch(/postgres_pool_connections\{pool="primary",state="idle"[^}]*\} 3/);
    expect(body).toMatch(/postgres_pool_waiting\{pool="primary"[^}]*\} 2/);
    expect(body).toMatch(/postgres_pool_max_connections\{pool="primary"[^}]*\} 30/);
    expect(body).toMatch(/postgres_pool_connections\{pool="maintenance",state="in_use"[^}]*\} 1/);
    expect(body).toMatch(/postgres_pool_max_connections\{pool="maintenance"[^}]*\} 10/);
    expect(body).toMatch(/postgres_pool_metrics_available(\{[^}]*\})? 1/);
  });

  it('hands the same counts to the pool-exhaustion evaluation', async () => {
    const { refreshPostgresPoolMetrics } = await import(
      '@/infrastructure/observability/metrics/db-pool-metrics.js'
    );

    await refreshPostgresPoolMetrics();

    expect(evaluatePoolExhaustionAndAlert).toHaveBeenCalledWith(
      expect.objectContaining({ poolStatistics: POOL_STATISTICS }),
    );
  });

  it('raises the first sighting of each unscoped call site to Sentry, and only the first', async () => {
    const { registerPostgresPoolMetrics } = await import(
      '@/infrastructure/observability/metrics/db-pool-metrics.js'
    );
    const { recordUnscopedDatabaseAccess, resetUnscopedDatabaseAccessTrackingForTests } =
      await import('@/infrastructure/database/pool/unscoped-query-counter.js');
    resetUnscopedDatabaseAccessTrackingForTests();
    registerPostgresPoolMetrics();

    // One call site, reached three times: a hot offender is named once, not per query.
    for (let call = 0; call < 3; call += 1) recordUnscopedDatabaseAccess();

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith({
      message: 'database.query.unscoped',
      options: { level: 'warning', extra: { callSite: expect.stringMatching(/:\d+:\d+$/) } },
    });
  });

  it('stops alerting once the test reset clears the observer', async () => {
    const { registerPostgresPoolMetrics, resetPostgresPoolMonitoringForTests } = await import(
      '@/infrastructure/observability/metrics/db-pool-metrics.js'
    );
    const { recordUnscopedDatabaseAccess, resetUnscopedDatabaseAccessTrackingForTests } =
      await import('@/infrastructure/database/pool/unscoped-query-counter.js');
    registerPostgresPoolMetrics();
    resetPostgresPoolMonitoringForTests();
    resetUnscopedDatabaseAccessTrackingForTests();

    recordUnscopedDatabaseAccess();

    expect(captureMessage).not.toHaveBeenCalled();
  });
});
