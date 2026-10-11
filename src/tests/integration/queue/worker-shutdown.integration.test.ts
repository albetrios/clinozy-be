import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Queue, Worker } from 'bullmq';

import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';

describe('worker shutdown integration', () => {
  let queue: Queue | null = null;
  let worker: Worker | null = null;

  afterAll(async () => {
    await worker?.close(true);
    await queue?.close();
  });

  it('bounded worker.close drains within SHUTDOWN_TIMEOUT_MS default (15s)', async () => {
    const queueName = `worker-shutdown-drain-${randomUUID()}`;
    let processorCompletedAt = 0;
    let signalProcessorStarted: () => void = () => {};
    const processorStarted = new Promise<void>((resolve) => {
      signalProcessorStarted = resolve;
    });
    let releaseProcessor: () => void = () => {};
    const processorHeld = new Promise<void>((resolve) => {
      releaseProcessor = resolve;
    });

    const connection = getBullMQConnectionOptions();
    worker = new Worker(
      queueName,
      async () => {
        signalProcessorStarted();
        await processorHeld;
        processorCompletedAt = Date.now();
      },
      { connection, prefix: getBullMQKeyPrefix(), concurrency: 1 },
    );

    queue = new Queue(queueName, {
      connection,
      prefix: getBullMQKeyPrefix(),
      defaultJobOptions: {
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 5 },
      },
    });

    const handle = buildWorkerHandle({ worker, queueName });
    await worker.waitUntilReady();
    await queue.waitUntilReady();
    await queue.add('drain', {});
    await processorStarted;

    const closeStartedAt = Date.now();
    let closeSettled = false;
    const closing = handle.close().then(() => {
      closeSettled = true;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(processorCompletedAt).toBe(0);
      expect(closeSettled).toBe(false);
    } finally {
      // Release even when an assertion fails, so suite cleanup cannot hang on this job.
      releaseProcessor();
    }
    await closing;
    const closeFinishedAt = Date.now();

    expect(processorCompletedAt).toBeGreaterThan(0);
    expect(processorCompletedAt).toBeLessThanOrEqual(closeFinishedAt);
    expect(closeFinishedAt - closeStartedAt).toBeLessThan(15_000);
  });
});
