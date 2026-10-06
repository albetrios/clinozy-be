import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Queue, Worker, type Job } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { getDefaultWorkerOptions } from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { subscriptionSeatSyncDeduplication } from '@/domains/billing/sub-domains/subscription/queues/subscription-seat-sync.queue.js';

/**
 * Against real BullMQ and Redis, with the deduplication the seat-sync enqueue uses: seat syncs for
 * one organization never overlap, on any replica. Two replicas used to be able to run two jobs for
 * one organization at once — the one that read the older member count could finish last and leave
 * Stripe billing the wrong quantity until the next membership change.
 */
type SeatSyncTestJob = { organizationPublicId: string; label: string };

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('Integration: subscription seat sync runs one job per organization at a time', () => {
  const connection = getBullMQConnectionOptions();
  const workers: Worker[] = [];
  let queue: Queue<SeatSyncTestJob>;

  beforeEach(async () => {
    queue = new Queue<SeatSyncTestJob>(`test-seat-sync-${randomUUID()}`, {
      connection,
      prefix: getBullMQKeyPrefix(),
    });
    await queue.waitUntilReady();
  });

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.close()));
    await queue.obliterate({ force: true });
    await queue.close();
  });

  function addSeatSync(organizationPublicId: string, label: string) {
    return queue.add(
      'sync-subscription-seats',
      { organizationPublicId, label },
      {
        jobId: `seat-sync-${organizationPublicId}-${randomUUID()}`,
        deduplication: subscriptionSeatSyncDeduplication(organizationPublicId),
      },
    );
  }

  it('collapses a burst of member changes into one job while that job waits', async () => {
    await addSeatSync('org_burst', 'first');
    await addSeatSync('org_burst', 'second');
    await addSeatSync('org_burst', 'third');
    await addSeatSync('org_other', 'other');

    const waiting = await queue.getJobs(['waiting']);
    expect(waiting.map((job) => job.data.label).sort()).toEqual(['first', 'other']);
  });

  it('never runs one organization twice at once, and syncs again after a change that landed mid-run', async () => {
    const runs: string[] = [];
    let running = 0;
    let mostRunningAtOnce = 0;
    let releaseFirstRun: () => void = () => {};
    const firstRunHeld = new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    });

    // Two replicas with four slots each: plenty of room to run the same organization twice.
    for (let replica = 0; replica < 2; replica += 1) {
      workers.push(
        new Worker<SeatSyncTestJob>(
          queue.name,
          async (job: Job<SeatSyncTestJob>) => {
            running += 1;
            mostRunningAtOnce = Math.max(mostRunningAtOnce, running);
            runs.push(job.data.label);
            if (job.data.label === 'first') await firstRunHeld;
            running -= 1;
          },
          {
            connection,
            prefix: getBullMQKeyPrefix(),
            concurrency: 4,
            ...getDefaultWorkerOptions(),
          },
        ),
      );
    }
    await Promise.all(workers.map((worker) => worker.waitUntilReady()));

    await addSeatSync('org_live', 'first');
    await waitFor(() => runs.length === 1, 5_000);

    // Members change while the first sync runs: no second sync may start now…
    await addSeatSync('org_live', 'changed-mid-run');
    await addSeatSync('org_live', 'changed-again-mid-run');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(runs).toEqual(['first']);

    // …but exactly one more runs once it finishes, with the latest change.
    releaseFirstRun();
    await waitFor(() => runs.length === 2, 5_000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(runs).toEqual(['first', 'changed-again-mid-run']);
    expect(mostRunningAtOnce).toBe(1);
  }, 20_000);
});
