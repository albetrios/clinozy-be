import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Queue, type Job, type Worker } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { getDefaultWorkerOptions } from '@/infrastructure/queue/worker-runtime/worker-options.js';
import {
  PROVIDER_OUTAGE_PAUSABLE_LIMITER,
  createProviderPausableWorker,
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

/**
 * Time left on the queue's outage pause. Passing the limiter's `max` makes BullMQ ignore the
 * limiter's ordinary per-second job counter and report only the pause.
 */
function outagePauseLeftMs(queue: Queue): Promise<number> {
  return queue.getRateLimitTtl(PROVIDER_OUTAGE_PAUSABLE_LIMITER.max);
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

  function startReplicas(processor: (job: Job<{ label: string }>) => Promise<void>, count = 2) {
    for (let replica = 0; replica < count; replica += 1) {
      workers.push(
        createProviderPausableWorker<{ label: string }>({
          queueName: queue.name,
          provider: 'resend',
          processor,
          workerOptions: { connection, concurrency: 1, ...getDefaultWorkerOptions() },
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
