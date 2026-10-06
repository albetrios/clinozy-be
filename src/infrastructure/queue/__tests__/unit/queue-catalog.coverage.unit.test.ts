import { describe, expect, it } from 'vitest';
import {
  WORKER_QUEUE_NAMES,
  WORKER_THROUGHPUT_QUEUE_NAMES,
} from '@/infrastructure/queue/queue-catalog.js';
import { getWorkerQueueRegistrationDefinitions } from '@/infrastructure/queue/worker-runtime/worker-registration.registry.js';

/**
 * The queue catalog is the one list the depth gauges, the DLQ sampler and trim, the heartbeat
 * read-out and Bull Board use. Pinned to the worker registry, a new worker cannot ship unmonitored:
 * before it, five hand-kept lists had drifted — 14 queues had no depth gauge and 6 DLQs were never
 * sampled or trimmed.
 */
describe('queue catalog coverage', () => {
  const definitions = getWorkerQueueRegistrationDefinitions();

  it('lists every registered worker queue, and nothing else', () => {
    const registered = definitions.map((definition) => definition.queueName).sort();
    expect([...WORKER_QUEUE_NAMES].sort()).toEqual(registered);
    expect(new Set(WORKER_QUEUE_NAMES).size).toBe(WORKER_QUEUE_NAMES.length);
  });

  it('lists exactly the throughput workers as throughput queues', () => {
    const throughput = definitions
      .filter((definition) => definition.criticality === 'throughput')
      .map((definition) => definition.queueName)
      .sort();
    expect([...WORKER_THROUGHPUT_QUEUE_NAMES].sort()).toEqual(throughput);
  });
});
