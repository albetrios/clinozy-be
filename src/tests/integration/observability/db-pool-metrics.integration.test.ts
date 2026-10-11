import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { stopPostgresPoolMetricsPolling } from '@/infrastructure/observability/metrics/db-pool-metrics.js';
import { resetEnvCacheForTests } from '@/shared/config/env.config.js';
import { injectUnauthenticated } from '@/tests/helpers/test-http-inject.helper.js';

describe('db-pool-metrics integration', () => {
  const originalMetricsEnabled = process.env.METRICS_ENABLED;
  let application: FastifyInstance;

  beforeAll(async () => {
    process.env.METRICS_ENABLED = 'true';
    resetEnvCacheForTests();
    const { createTestApp } = await import('@/tests/helpers/test-app.js');
    const testApplication = await createTestApp();
    application = testApplication.app;
  });

  afterAll(async () => {
    stopPostgresPoolMetricsPolling();
    if (application) {
      await application.close();
    }
    if (originalMetricsEnabled === undefined) {
      delete process.env.METRICS_ENABLED;
    } else {
      process.env.METRICS_ENABLED = originalMetricsEnabled;
    }
    resetEnvCacheForTests();
  });

  it("GET /metrics exposes the live pool gauges and the role's pg_stat_activity gauges", async () => {
    /** /metrics is gated by METRICS_SCRAPE_TOKEN (see `metrics.middleware.ts`); pass the
     * token the test setup configures so the route returns 200 instead of 401. */
    const response = await injectUnauthenticated(application, {
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${process.env.METRICS_SCRAPE_TOKEN ?? ''}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;

    expect(body).toContain('postgres_pool_metrics_available 1');
    // This process's own pool, counted by node-postgres.
    expect(body).toMatch(/postgres_pool_max_connections\{pool="primary"[^}]*\} [1-9]\d*/);
    expect(body).toMatch(/postgres_pool_connections\{pool="primary",state="in_use"[^}]*\} \d+/);
    expect(body).toMatch(/postgres_pool_connections\{pool="primary",state="idle"[^}]*\} \d+/);
    expect(body).toMatch(/postgres_pool_waiting\{pool="primary"[^}]*\} \d+/);
    expect(body).toMatch(/db_pool_connections\{state="active"[^}]*\} \d+/);
    expect(body).toMatch(/db_pool_connections\{state="idle"[^}]*\} \d+/);
    expect(body).toMatch(/db_pool_connections\{state="waiting"[^}]*\} \d+/);
    expect(body).toContain('# TYPE db_pool_connections gauge');
  }, 15_000);
});
