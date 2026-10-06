import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Queue, type Job, type RateLimiterOptions, type Worker } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { getDefaultWorkerOptions } from '@/infrastructure/queue/worker-runtime/worker-options.js';
import {
  ProviderOutageError,
  createProviderPausableWorker,
  getProviderPauseLeftMs,
} from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import {
  CircuitBreakerOpenError,
  resendCircuit,
} from '@/infrastructure/resilience/circuit-breaker.js';

/**
 * Against real BullMQ and Redis: while a provider is down its queue pauses on every replica, the
 * failed job waits the outage out without spending an attempt, and once the pause ends everything
 * is processed — the job that waited and the jobs that arrived meanwhile.
 *
 * Two workers stand in for two replicas. The pause has to hold for both: BullMQ enforces it in
 * Redis only for a worker that declares a limiter, and without one the second replica kept pulling
 * jobs into the outage.
 */
const PAUSE_MS = 2_000;

/** Time left on the queue's provider pause — never the limiter's ordinary per-second count. */
function outagePauseLeftMs(queue: Queue): Promise<number> {
  return getProviderPauseLeftMs(queue);
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Integration: provider outage pauses the queue', () => {
  const connection = getBullMQConnectionOptions();
  const workers: Worker[] = [];
  let queue: Queue;

  beforeEach(async () => {
    queue = new Queue(`test-provider-pause-${randomUUID()}`, {
      connection,
      prefix: getBullMQKeyPrefix(),
    });
    await queue.waitUntilReady();
    // The Resend circuit is healthy unless a case says otherwise — never another suite's leftover.
    vi.spyOn(resendCircuit, 'getState').mockResolvedValue('CLOSED');
  });

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.close()));
    await queue.obliterate({ force: true });
    await queue.close();
    vi.restoreAllMocks();
  });

  function startReplicas(
    processor: (job: Job<{ label: string }>) => Promise<void>,
    count = 2,
    options: { concurrency?: number; limiter?: RateLimiterOptions } = {},
  ) {
    for (let replica = 0; replica < count; replica += 1) {
      workers.push(
        createProviderPausableWorker<{ label: string }>({
          queueName: queue.name,
          provider: 'resend',
          processor,
          workerOptions: {
            connection,
            concurrency: options.concurrency ?? 1,
            ...getDefaultWorkerOptions(),
          },
          ...(options.limiter ? { limiter: options.limiter } : {}),
          pauseMs: PAUSE_MS,
        }),
      );
    }
    return Promise.all(workers.map((worker) => worker.waitUntilReady()));
  }

  it('pauses every replica, spends no attempt, and processes everything once the provider is back', async () => {
    let providerDown = true;
    const processed: string[] = [];
    await startReplicas(async (job) => {
      if (providerDown) {
        throw new CircuitBreakerOpenError('resend', 30_000, 'Circuit breaker "resend" is OPEN');
      }
      processed.push(job.data.label);
    });

    const parked = await queue.add('send', { label: 'parked' }, { attempts: 3 });
    await waitFor(async () => (await parked.getState()) === 'delayed', 5_000);

    // The job waits the outage out at the back of the line, its retry budget untouched.
    expect((await queue.getJob(parked.id as string))?.attemptsMade).toBe(0);
    // The whole queue is paused, in Redis, for the pause window.
    const pauseLeftMs = await outagePauseLeftMs(queue);
    expect(pauseLeftMs).toBeGreaterThan(0);
    expect(pauseLeftMs).toBeLessThanOrEqual(PAUSE_MS);

    // The provider recovers, and a job arrives during the pause: neither replica may take it yet.
    providerDown = false;
    const arrived = await queue.add('send', { label: 'arrived' }, { attempts: 3 });
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS / 3));
    expect(await arrived.getState()).toBe('waiting');
    expect(processed).toEqual([]);

    // The pause ends and both are processed, each exactly once.
    await waitFor(
      async () =>
        (await parked.getState()) === 'completed' && (await arrived.getState()) === 'completed',
      PAUSE_MS * 4,
    );
    expect([...processed].sort()).toEqual(['arrived', 'parked']);
    const finished = await queue.getJob(parked.id as string);
    // Started twice, but the only attempt spent is the one that succeeded — the outage spent none.
    expect(finished?.attemptsStarted).toBe(2);
    expect(finished?.attemptsMade).toBe(1);
    expect(await outagePauseLeftMs(queue)).toBeLessThanOrEqual(0);
  }, 20_000);

  it('puts the parked job at the back of the line, so a probe that keeps failing cannot hold the queue', async () => {
    // One replica, so the order jobs are taken in is the order they are processed in.
    const processed: string[] = [];
    let failuresLeft = 1;
    await startReplicas(async (job) => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new CircuitBreakerOpenError('resend', 30_000, 'Circuit breaker "resend" is OPEN');
      }
      processed.push(job.data.label);
    }, 1);

    const probe = await queue.add('send', { label: 'probe' }, { attempts: 3 });
    await waitFor(async () => (await probe.getState()) === 'delayed', 5_000);
    await queue.add('send', { label: 'behind' }, { attempts: 3 });

    await waitFor(async () => processed.length === 2, PAUSE_MS * 4);
    expect(processed).toEqual(['behind', 'probe']);
  }, 20_000);

  it('waits out a throttle for its Retry-After only — and never cuts a longer outage pause short', async () => {
    const throttleMs = 300;
    let throttled = false;
    const processed: string[] = [];
    await startReplicas(
      async (job) => {
        if (job.data.label === 'outage') {
          throw new CircuitBreakerOpenError('resend', 30_000, 'Circuit breaker "resend" is OPEN');
        }
        if (job.data.label === 'throttled' && !throttled) {
          // Throttled only once the outage pause is in place: the shorter pause must not replace it.
          await waitFor(async () => (await outagePauseLeftMs(queue)) > PAUSE_MS / 2, 5_000);
          throttled = true;
          throw new ProviderOutageError({
            provider: 'resend',
            cause: new Error('429 rate_limit_exceeded'),
            retryAfterMs: throttleMs,
          });
        }
        processed.push(job.data.label);
      },
      1,
      { concurrency: 2 },
    );

    await queue.add('send', { label: 'outage' }, { attempts: 3 });
    const throttledJob = await queue.add('send', { label: 'throttled' }, { attempts: 3 });
    await waitFor(async () => throttled && (await throttledJob.getState()) === 'delayed', 5_000);

    // The five-minute-style outage pause still holds after the 300 ms throttle.
    expect(await outagePauseLeftMs(queue)).toBeGreaterThan(throttleMs);
    expect((await queue.getJob(throttledJob.id as string))?.attemptsMade).toBe(0);
  }, 20_000);

  it('a throttle alone pauses only for its Retry-After', async () => {
    const throttleMs = 400;
    let throttledOnce = false;
    const processedAt: number[] = [];
    await startReplicas(async () => {
      if (!throttledOnce) {
        throttledOnce = true;
        throw new ProviderOutageError({
          provider: 'resend',
          cause: new Error('429 rate_limit_exceeded'),
          retryAfterMs: throttleMs,
        });
      }
      processedAt.push(Date.now());
    }, 1);

    const startedAt = Date.now();
    const job = await queue.add('send', { label: 'throttled' }, { attempts: 3 });
    await waitFor(async () => (await job.getState()) === 'completed', PAUSE_MS * 2);

    const waitedMs = (processedAt[0] ?? Date.now()) - startedAt;
    expect(waitedMs).toBeGreaterThanOrEqual(throttleMs - 50);
    // Nowhere near the outage pause: a throttle is seconds, not minutes.
    expect(waitedMs).toBeLessThan(PAUSE_MS);
    expect((await queue.getJob(job.id as string))?.attemptsMade).toBe(1);
  }, 20_000);

  it('paces the queue to its limiter across every replica', async () => {
    // Two replicas, two jobs a second between them: six jobs take three windows, not one burst.
    const startedAt = Date.now();
    const processedAt: number[] = [];
    await startReplicas(
      async () => {
        processedAt.push(Date.now());
      },
      2,
      { concurrency: 4, limiter: { max: 2, duration: 1_000 } },
    );

    await queue.addBulk(
      Array.from({ length: 6 }, (_, index) => ({ name: 'send', data: { label: `job-${index}` } })),
    );
    await waitFor(async () => processedAt.length === 6, 10_000);

    expect(Math.max(...processedAt) - startedAt).toBeGreaterThanOrEqual(1_900);
  }, 20_000);

  it('keeps spending attempts on a failure that is the job’s own', async () => {
    // The circuit stays CLOSED: a plain failure is this job's problem, not an outage.
    await startReplicas(async () => {
      throw new Error('bad payload');
    }, 1);

    const job = await queue.add(
      'send',
      { label: 'broken' },
      { attempts: 2, backoff: { type: 'fixed', delay: 10 } },
    );
    await waitFor(async () => (await job.getState()) === 'failed', 5_000);

    expect((await queue.getJob(job.id as string))?.attemptsMade).toBe(2);
    expect(await outagePauseLeftMs(queue)).toBeLessThanOrEqual(0);
  }, 20_000);
});
