import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import {
  closeBullMQMetricsQueues,
  getQueueDepths,
  getQueuesWaitingJobCount,
} from '@/infrastructure/observability/metrics/bullmq-metrics.js';

/**
 * Against real BullMQ: a queue paused for its provider has work waiting by design, so worker
 * readiness does not count it toward "stalled". It used to — wired to the heartbeat, `/readyz`
 * would have answered 503 through a provider outage and the orchestrator restarted the worker in a
 * loop, each restart pausing again. `/readyz` reports the time left on the pause instead.
 */
describe('Integration: readiness during a provider pause', () => {
  const queue = new Queue(`test-readiness-pause-${randomUUID()}`, {
    connection: getBullMQConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await closeBullMQMetricsQueues();
  });

  it('counts waiting work only for a queue that is not paused for its provider', async () => {
    await queue.add('send', { label: 'waiting' });
    expect(await getQueuesWaitingJobCount([queue.name])).toBe(1);

    await queue.rateLimit(60_000);

    expect(await getQueuesWaitingJobCount([queue.name])).toBe(0);
    const [depth] = await getQueueDepths([queue.name]);
    expect(depth).toMatchObject({ queue: queue.name, waiting: 1 });
    expect(depth?.provider_pause_ms).toBeGreaterThan(50_000);
  });
});
