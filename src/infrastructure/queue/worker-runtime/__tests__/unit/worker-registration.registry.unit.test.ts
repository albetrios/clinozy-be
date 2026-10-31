import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/config/env.config.js', () => ({
  env: new Proxy(
    {
      LOG_LEVEL: 'silent',
      WORKER_CONCURRENCY: 4,
      WORKER_CONCURRENCY_MAIL: 4,
      WORKER_CONCURRENCY_NOTIFY: 4,
      WORKER_CONCURRENCY_WEBHOOK: 4,
      WORKER_CONCURRENCY_STRIPE: 4,
    },
    {
      get(target, property: string) {
        return property in target ? target[property as keyof typeof target] : undefined;
      },
    },
  ),
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/infrastructure/database/connection.js', () => ({
  sql: vi.fn(),
  database: {},
}));

vi.mock('@/infrastructure/cache/redis.client.js', () => ({
  redis: {},
  redisConnection: {},
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

import {
  getWorkerQueueOperationalManifest,
  getWorkerQueueRegistrationDefinitions,
} from '@/infrastructure/queue/worker-runtime/worker-registration.registry.js';
import { WORKER_QUEUE_FAMILY_NAMES } from '@/infrastructure/queue/worker-runtime/worker-queue-family.constants.js';

describe('worker-registration.registry', () => {
  it('keeps complete metadata for every registered worker', () => {
    const definitions = getWorkerQueueRegistrationDefinitions();

    // REQ-4: +1 for the subscription-seat-sync worker (Stripe family, throughput, Postgres-backed);
    // +1 for the webhook-delivery-reclaim sweep (webhook family, cron, Postgres-backed); +1 for the
    // app record purge (WC-46); +2 for the day auto-close sweep and its per-organization jobs (WC-39);
    // +2 for the task rules sweep and its per-organization runs (TK4); +4 for messaging (D77): the
    // delivery and callback-processing workers, the one-minute sweep and the callbacks' purge; +2 for
    // the AI ideas sweep and its per-organization refreshes (D80, WC-47); +1 for the membership
    // invitation expiry sweep (launch D84).
    expect(definitions).toHaveLength(40);
    for (const definition of definitions) {
      expect(definition.queueName).toBeTruthy();
      expect(definition.logLabel).toBeTruthy();
      expect(WORKER_QUEUE_FAMILY_NAMES).toContain(definition.family);
      expect(typeof definition.usesPostgres).toBe('boolean');
      expect(typeof definition.scheduled).toBe('boolean');
      expect(['throughput', 'maintenance', 'observability']).toContain(definition.criticality);
      expect(typeof definition.create).toBe('function');

      if (definition.usesPostgres) {
        expect(definition.resolvePostgresConcurrency).toEqual(expect.any(Function));
      } else {
        expect(definition.resolvePostgresConcurrency).toBeUndefined();
        expect(definition.holdsConnectionDuringExternalIo).not.toBe(true);
      }
    }
  });

  it('keeps expected family, criticality, scheduler, and external-io counts', () => {
    const definitions = getWorkerQueueRegistrationDefinitions();

    // REQ-4: subscription-seat-sync adds one Postgres-backed throughput worker (event-driven, plus the
    // hourly seat reconcile on its queue); the webhook-delivery-reclaim sweep one Postgres-backed,
    // scheduled, maintenance worker; user-data-export also runs its lost-enqueue sweep. The app
    // record purge and the day auto-close sweep add two more, and the auto-close jobs one
    // Postgres-backed, event-driven (the sweep adds them), throughput worker; the task rules sweep and
    // its runs the same pair again; the membership invitation expiry sweep (D84) one Postgres-backed,
    // scheduled, maintenance worker; the patient image thumbnail worker (its 15-minute sweep rides the
    // same queue) one Postgres-backed, scheduled, throughput worker.
    expect(definitions.filter((definition) => definition.usesPostgres)).toHaveLength(37);
    expect(definitions.filter((definition) => definition.scheduled)).toHaveLength(34);
    expect(
      definitions.filter((definition) => definition.criticality === 'throughput'),
    ).toHaveLength(9);
    expect(
      definitions.filter((definition) => definition.criticality === 'maintenance'),
    ).toHaveLength(29);
    expect(
      definitions.filter((definition) => definition.criticality === 'observability'),
    ).toHaveLength(2);
    // No worker holds a database context across an outbound call: the audit export, the data
    // export, the upload sweep and both retention purges open short contexts around their S3 calls.
    expect(
      definitions
        .filter((definition) => definition.holdsConnectionDuringExternalIo === true)
        .map((definition) => definition.queueName),
    ).toEqual([]);
  });

  it('has no maintenance workers left unscheduled (every retention worker has a cron)', () => {
    const orphanQueueNames = getWorkerQueueRegistrationDefinitions()
      .filter(
        (definition) => definition.criticality === 'maintenance' && definition.scheduled === false,
      )
      .map((definition) => definition.queueName)
      .sort();

    expect(orphanQueueNames).toEqual([]);
  });

  it('exports a serializable operational manifest without factory functions', () => {
    const manifest = getWorkerQueueOperationalManifest();
    expect(manifest).toHaveLength(getWorkerQueueRegistrationDefinitions().length);
    for (const entry of manifest) {
      expect(entry).not.toHaveProperty('create');
      expect(entry.queueName).toBeTruthy();
      expect(entry.family).toBeTruthy();
    }
  });
});
