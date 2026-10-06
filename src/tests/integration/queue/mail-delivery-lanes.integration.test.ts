import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Queue, Worker } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import {
  MAIL_BULK_LANE_PRIORITY,
  MAIL_QUEUE_NAME,
  closeMailQueue,
  enqueueMailOutboxJob,
} from '@/infrastructure/mail/queues/mail.queue.js';

/**
 * Against real BullMQ: a sign-in code is never stuck behind a notification broadcast. Bulk mail
 * carries a BullMQ priority and transactional mail none — and BullMQ takes a job without a priority
 * before any prioritized one, so the code goes out first however many bulk emails are waiting.
 */
describe('Integration: mail delivery lanes', () => {
  const connection = getBullMQConnectionOptions();
  const inspector = new Queue(MAIL_QUEUE_NAME, { connection, prefix: getBullMQKeyPrefix() });

  afterAll(async () => {
    await closeMailQueue();
    await inspector.close();
  });

  it('sends a transactional email before the bulk emails queued ahead of it', async () => {
    const bulkTokens = [randomUUID(), randomUUID(), randomUUID()];
    const transactionalToken = randomUUID();
    for (const token of bulkTokens) {
      await enqueueMailOutboxJob(token, { lane: 'bulk' });
    }
    await enqueueMailOutboxJob(transactionalToken);

    const ours = new Set([...bulkTokens, transactionalToken]);
    const enqueueOrder = [...bulkTokens, transactionalToken];
    const queued = (await inspector.getJobs(['waiting', 'prioritized']))
      .filter((job) => ours.has(job.data?.mailOutboxToken))
      .sort(
        (left, right) =>
          enqueueOrder.indexOf(left.data.mailOutboxToken) -
          enqueueOrder.indexOf(right.data.mailOutboxToken),
      );
    expect(queued).toHaveLength(4);
    for (const job of queued) {
      const expectedPriority =
        job.data.mailOutboxToken === transactionalToken ? 0 : MAIL_BULK_LANE_PRIORITY;
      expect(job.opts.priority ?? 0).toBe(expectedPriority);
    }

    // The shared test `mail` queue holds whatever other suites enqueued (nothing drains it), so
    // the order is proven on a queue of its own, with exactly these priorities.
    await Promise.all(queued.map((job) => job.remove()));
    const sentOrder = await processInPriorityOrder(
      queued.map((job) => ({
        token: job.data.mailOutboxToken as string,
        priority: job.opts.priority ?? 0,
      })),
    );

    expect(sentOrder[0]).toBe(transactionalToken);
    expect(sentOrder.slice(1)).toEqual(bulkTokens);
  });

  /** Adds the jobs in the given order to a private queue and returns the order one worker takes. */
  async function processInPriorityOrder(
    jobs: { token: string; priority: number }[],
  ): Promise<string[]> {
    const queue = new Queue(`test-mail-lanes-${randomUUID()}`, {
      connection,
      prefix: getBullMQKeyPrefix(),
    });
    const sentOrder: string[] = [];
    try {
      for (const { token, priority } of jobs) {
        await queue.add('send-email', { token }, priority > 0 ? { priority } : {});
      }
      const worker = new Worker(
        queue.name,
        async (job) => {
          sentOrder.push(job.data.token);
        },
        { connection, prefix: getBullMQKeyPrefix(), concurrency: 1 },
      );
      try {
        const deadline = Date.now() + 10_000;
        while (sentOrder.length < jobs.length && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      } finally {
        await worker.close();
      }
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
    return sentOrder;
  }
});
