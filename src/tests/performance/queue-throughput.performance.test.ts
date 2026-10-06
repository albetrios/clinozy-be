import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Queue, type Job, type Worker } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { getDefaultWorkerOptions } from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { createProviderPausableWorker } from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import {
  CircuitBreakerOpenError,
  resendCircuit,
} from '@/infrastructure/resilience/circuit-breaker.js';

/**
 * The queue runtime at volume, against real Redis: the worker factory, options and limiter the
 * provider-dependent queues run in production, two replicas, several thousand jobs.
 *
 * - A burst drains with every job processed exactly once.
 * - A backlog that builds up during a provider outage loses nothing: no job fails or reaches the
 *   dead-letter path, no attempt is spent, and once the provider is back every job is processed
 *   exactly once.
 */
const REPLICAS = 2;
const CONCURRENCY = 8;

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Performance: queue runtime at volume', () => {
  const connection = getBullMQConnectionOptions();
  const workers: Worker[] = [];
  let queue: Queue;

  beforeEach(async () => {
    queue = new Queue(`test-queue-volume-${randomUUID()}`, {
      connection,
      prefix: getBullMQKeyPrefix(),
    });
    await queue.waitUntilReady();
    vi.spyOn(resendCircuit, 'getState').mockResolvedValue('CLOSED');
  });

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.close()));
    await queue.obliterate({ force: true });
    await queue.close();
    vi.restoreAllMocks();
  });

  function startReplicas(
    processor: (job: Job<{ index: number }>) => Promise<void>,
    pauseMs: number,
  ) {
    for (let replica = 0; replica < REPLICAS; replica += 1) {
      workers.push(
        createProviderPausableWorker<{ index: number }>({
          queueName: queue.name,
          provider: 'resend',
          processor,
          workerOptions: { connection, concurrency: CONCURRENCY, ...getDefaultWorkerOptions() },
          pauseMs,
        }),
      );
    }
    return Promise.all(workers.map((worker) => worker.waitUntilReady()));
  }

  async function addJobs(count: number, attempts: number) {
    for (let start = 0; start < count; start += 1_000) {
      await queue.addBulk(
        Array.from({ length: Math.min(1_000, count - start) }, (_, offset) => ({
          name: 'send',
          data: { index: start + offset },
          opts: { attempts, removeOnComplete: true },
        })),
      );
    }
  }

  it('drains a 10,000-job burst across two replicas, each job exactly once', async () => {
    const JOB_COUNT = 10_000;
    const timesProcessed = new Map<number, number>();
    await startReplicas(async (job) => {
      timesProcessed.set(job.data.index, (timesProcessed.get(job.data.index) ?? 0) + 1);
    }, 1_000);

    const startedAt = Date.now();
    await addJobs(JOB_COUNT, 3);
    await waitFor(() => timesProcessed.size === JOB_COUNT, 120_000);
    const elapsedMs = Date.now() - startedAt;

    expect([...timesProcessed.values()].every((count) => count === 1)).toBe(true);
    expect(await queue.getFailedCount()).toBe(0);
    // A floor far below what local Redis sustains: it catches a runtime that serialises or
    // stalls, not a slow laptop.
    expect(JOB_COUNT / (elapsedMs / 1_000)).toBeGreaterThan(200);
  }, 180_000);

  it('keeps a 2,000-job backlog through a provider outage and processes it all once the provider is back', async () => {
    const JOB_COUNT = 2_000;
    let providerDown = true;
    let outageFailures = 0;
    const timesProcessed = new Map<number, number>();
    await startReplicas(async (job) => {
      if (providerDown) {
        outageFailures += 1;
        throw new CircuitBreakerOpenError('resend', 30_000, 'Circuit breaker "resend" is OPEN');
      }
      timesProcessed.set(job.data.index, (timesProcessed.get(job.data.index) ?? 0) + 1);
    }, 1_000);

    await addJobs(JOB_COUNT, 3);
    // The outage: the queue pauses as soon as the first jobs hit it; the backlog waits.
    await waitFor(() => outageFailures > 0, 30_000);
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(timesProcessed.size).toBe(0);
    expect(await queue.getFailedCount()).toBe(0);
    // Only a probe per slot per one-second pause ever ran — the pause held the rest of the
    // backlog back. Without it the 2,000 jobs would each fail over and over in that time.
    expect(outageFailures).toBeLessThanOrEqual(REPLICAS * CONCURRENCY * 5);

    providerDown = false;
    await waitFor(() => timesProcessed.size === JOB_COUNT, 120_000);

    expect([...timesProcessed.values()].every((count) => count === 1)).toBe(true);
    expect(await queue.getFailedCount()).toBe(0);
  }, 180_000);
});
