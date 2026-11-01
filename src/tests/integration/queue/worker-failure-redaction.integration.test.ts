import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import { resolveBullMqRedisUrl } from '@/infrastructure/cache/redis-url.util.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

/**
 * C-1 (the BullMQ remainder): BullMQ stores a failed job's `failedReason` (the error message) and
 * `stacktrace` (its stack) in Redis. A processor that hit a database failure stored Drizzle's
 * `Failed query: <sql> params: <values>` there — a bound patient name, readable by anyone with the
 * dashboards or Redis. Every worker the runtime registers goes through `buildWorkerHandle`, which
 * now records the sanitized error. This fails a real job on a real foreign-key violation with a
 * recognisable value bound into the statement, then reads the job back from Redis.
 */
describe('Integration: a failed job stores no bound value in Redis (C-1)', () => {
  const connection = getBullMQConnectionOptions();
  const missingUserId = 2_000_000_000;
  let marker: string;
  let queue: Queue;
  let queueEvents: QueueEvents;
  let worker: Worker | undefined;
  /** A plain client on BullMQ's Redis, to read the job hash exactly as stored. */
  const rawRedis = new Redis(resolveBullMqRedisUrl(), { lazyConnect: true });

  function insertOrganizationOwnedByNobody() {
    return getOperatorDatabase()
      .insert(organizations)
      .values({
        public_id: generatePublicId('organization'),
        name: marker,
        slug: `slug-${randomUUID()}`,
        owner_user_id: missingUserId,
        created_by_user_id: missingUserId,
      });
  }

  beforeEach(async () => {
    marker = `Patient-${randomUUID()}`;
    queue = new Queue(`test-worker-failure-redaction-${randomUUID()}`, {
      connection,
      prefix: getBullMQKeyPrefix(),
    });
    queueEvents = new QueueEvents(queue.name, { connection, prefix: getBullMQKeyPrefix() });
    await Promise.all([queue.waitUntilReady(), queueEvents.waitUntilReady()]);
  });

  afterAll(async () => {
    await rawRedis.quit();
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await queueEvents.close();
    await queue.obliterate({ force: true });
    await queue.close();
  });

  /** Runs one job to failure on a fresh worker; `throughRuntime` wraps it with buildWorkerHandle. */
  async function failOneJob(throughRuntime: boolean) {
    worker = new Worker(
      queue.name,
      async () => {
        await insertOrganizationOwnedByNobody();
      },
      { connection, prefix: getBullMQKeyPrefix(), concurrency: 1 },
    );
    if (throughRuntime) buildWorkerHandle({ worker, queueName: queue.name });

    const job = await queue.add('insert-organization', {}, { attempts: 1 });
    await job.waitUntilFinished(queueEvents).catch(() => undefined);

    const stored = await queue.getJob(job.id ?? '');
    const rawHash = await rawRedis.hgetall(queue.toKey(job.id ?? ''));
    return { stored, rawHash };
  }

  it('without the runtime wrap, the raw failure does put the bound value in Redis (the leak)', async () => {
    const { stored } = await failOneJob(false);
    expect(stored?.failedReason).toContain(marker);
  });

  it('a worker built through buildWorkerHandle stores only the code, constraint and table', async () => {
    const { stored, rawHash } = await failOneJob(true);

    expect(stored?.failedReason).toMatch(/^Database query failed \(SQLSTATE 23503, /);
    expect(stored?.failedReason).not.toContain(marker);
    expect(stored?.failedReason).not.toContain('params:');
    expect(stored?.stacktrace?.length).toBeGreaterThan(0);
    for (const frame of stored?.stacktrace ?? []) {
      expect(frame).not.toContain(marker);
      expect(frame).not.toContain(String(missingUserId));
    }
    // The whole job hash, every field BullMQ wrote — not only the two it exposes.
    expect(Object.keys(rawHash)).toContain('failedReason');
    expect(JSON.stringify(rawHash)).not.toContain(marker);
  });
});
