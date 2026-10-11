import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import {
  MAIL_QUEUE_NAME,
  closeMailQueue,
  enqueueMailOutboxJob,
} from '@/infrastructure/mail/queues/mail.queue.js';

/**
 * Against real BullMQ: an outbox row has at most one live mail job. During a Resend outage the
 * row's job sits parked for hours while the outbox sweeper re-enqueues the row on every pass —
 * without the deduplication each pass added another job for the same email.
 */
describe('Integration: mail enqueue keeps one live job per outbox row', () => {
  const inspector = new Queue(MAIL_QUEUE_NAME, {
    connection: getBullMQConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
  });

  afterAll(async () => {
    await closeMailQueue();
    await inspector.close();
  });

  async function liveJobsFor(mailOutboxToken: string) {
    const jobs = await inspector.getJobs(['waiting', 'delayed', 'active', 'prioritized']);
    return jobs.filter((job) => job.data?.mailOutboxToken === mailOutboxToken);
  }

  it('ignores a re-enqueue while the row still has a job, and accepts one after that job is gone', async () => {
    const mailOutboxToken = randomUUID();

    await enqueueMailOutboxJob({ mailOutboxToken, options: { requestId: 'first-dispatch' } });
    await enqueueMailOutboxJob({ mailOutboxToken, options: { requestId: 'mail-outbox-sweeper' } });
    await enqueueMailOutboxJob({ mailOutboxToken, options: { requestId: 'mail-outbox-sweeper' } });

    const live = await liveJobsFor(mailOutboxToken);
    expect(live).toHaveLength(1);
    expect(live[0]?.data.requestId).toBe('first-dispatch');

    // The job is gone (finished, or lost with Redis): the row can be enqueued again.
    await live[0]?.remove();
    await enqueueMailOutboxJob({ mailOutboxToken, options: { requestId: 'mail-outbox-sweeper' } });
    const again = await liveJobsFor(mailOutboxToken);
    expect(again).toHaveLength(1);

    await again[0]?.remove();
  });
});
