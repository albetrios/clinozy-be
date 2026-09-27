/**
 * The env template's connection budget must fit the worker it starts.
 *
 * A fresh `.env.local` scaffolded from `.env.example` once produced a worker that could never
 * boot: the monolithic worker needs ~47 Postgres connections, the template pool was 20, and the
 * budget capped it at 30 because the template claimed 100 connections while Compose allows 500.
 * This pins the template against the REAL worker registry and the template's own worker
 * settings, so a new queue or a higher default concurrency fails here, not at boot.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const envValues = vi.hoisted(() => ({ LOG_LEVEL: 'silent' }) as Record<string, unknown>);

vi.mock('@/shared/config/env.config.js', () => ({
  env: new Proxy(envValues, {
    get(target, property: string) {
      return target[property];
    },
  }),
}));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/infrastructure/database/connection.js', () => ({ database: {}, sql: vi.fn() }));
vi.mock('@/infrastructure/cache/redis.client.js', () => ({ redisConnection: {} }));
vi.mock('bullmq', () => ({ Queue: vi.fn(), Worker: vi.fn(), QueueEvents: vi.fn() }));
// Worst case: every optional queue enabled, so the budget covers a fully configured stack.
vi.mock('@/infrastructure/mail/mail.service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isMailConfigured: () => true,
}));
vi.mock('@/infrastructure/payment/stripe.client.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isStripeConfigured: () => true,
  isStripeWebhookIngressConfigured: () => true,
}));

import { computeWorkerPostgresPoolDemand } from '@/infrastructure/queue/worker-runtime/worker-connection-budget.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../../..');

/** Active `KEY=value` assignments from the committed env template. */
function readTemplate(): Record<string, string> {
  const assignments: Record<string, string> = {};
  for (const line of readFileSync(resolve(REPOSITORY_ROOT, '.env.example'), 'utf8').split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      assignments[match[1]] = match[2];
    }
  }
  return assignments;
}

const template = readTemplate();
const templatePool = Number(template.DATABASE_POOL_MAX);

describe('env template worker pool budget', () => {
  it("covers the template worker's peak Postgres demand, with burst headroom", () => {
    for (const key of Object.keys(template).filter((name) => name.startsWith('WORKER_'))) {
      const value = template[key] ?? '';
      envValues[key] = /^\d+$/.test(value) ? Number(value) : value;
    }
    const demand = computeWorkerPostgresPoolDemand();

    expect(demand.monolithicWorker).toBe(true);
    // Anti-vacuity: the real registry loaded and contributes real demand.
    expect(demand.peakPostgresConcurrency).toBeGreaterThan(20);
    expect(demand.peakPostgresConcurrencyWithSafetyMargin).toBeLessThanOrEqual(templatePool);
  });

  it('fits every template process inside the Compose connection budget', () => {
    // An unset POSTGRES_MAX_CONNECTIONS means "read the live server" — Compose's value locally.
    const composeMax = /max_connections=(\d+)/.exec(
      readFileSync(resolve(REPOSITORY_ROOT, 'docker-compose.yml'), 'utf8'),
    )?.[1];
    const maxConnections = Number(template.POSTGRES_MAX_CONNECTIONS ?? composeMax);
    expect(maxConnections).toBeGreaterThan(0);

    const processes =
      Number(template.DEPLOYMENT_API_REPLICA_COUNT) +
      Number(template.DEPLOYMENT_WORKER_REPLICA_COUNT);
    expect(processes).toBeGreaterThan(0);
    expect(processes * templatePool).toBeLessThanOrEqual(
      maxConnections - Number(template.POSTGRES_RESERVED_CONNECTIONS),
    );
  });
});
