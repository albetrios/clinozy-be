import { beforeEach, describe, expect, it, vi } from 'vitest';

const addMock = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Queue: class {
    add = addMock;
    waitUntilReady = vi.fn().mockResolvedValue(undefined);
    getJobCounts = vi.fn().mockResolvedValue({});
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('@/infrastructure/queue/connection.js', () => ({
  getBullMQKeyPrefix: () => 'test:bull',
  getBullMQProducerConnectionOptions: () => ({}),
}));

vi.mock('@/infrastructure/observability/tracing/trace-context.util.js', () => ({
  captureTraceContextForPropagation: () => ({}),
}));

import { enqueueNotification } from '@/domains/notify/sub-domains/notification/queues/notification.queue.js';

const NOTIFICATION_PUBLIC_ID = 'ntf_9z3rura5kqvcv8zggriym';

describe('enqueueNotification', () => {
  beforeEach(() => {
    addMock.mockClear();
  });

  // audit #6: the enqueue must be idempotent per notification so a recovery/redelivery path
  // cannot dispatch (and email) the same notification twice.
  it('adds the job with the notification public id as its jobId for dedup', async () => {
    await enqueueNotification({
      notificationId: 123,
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: 'org_public_id',
      requestId: 'request-1',
    });

    expect(addMock).toHaveBeenCalledTimes(1);
    const [jobName, jobData, options] = addMock.mock.calls[0]!;
    expect(jobName).toBe('dispatch-notification');
    expect(jobData).toMatchObject({
      notificationId: 123,
      organizationPublicId: 'org_public_id',
      requestId: 'request-1',
    });
    expect(options).toEqual({ jobId: NOTIFICATION_PUBLIC_ID });
  });

  it('derives the jobId from the public id for tenant-less notifications too', async () => {
    await enqueueNotification({
      notificationId: 456,
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: null,
    });

    const [, jobData, options] = addMock.mock.calls[0]!;
    expect(jobData).toMatchObject({ notificationId: 456, organizationPublicId: null });
    expect(options).toEqual({ jobId: NOTIFICATION_PUBLIC_ID });
  });

  it('gives the same bigserial in two databases different job ids', async () => {
    // The bigserial restarts at 1 after TRUNCATE ... RESTART IDENTITY or a restore while BullMQ
    // keeps finished jobs for 7 days — and drops an add whose job id still exists.
    await enqueueNotification({
      notificationId: 1,
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: null,
    });
    await enqueueNotification({
      notificationId: 1,
      notificationPublicId: 'ntf_bchnclznbnkn5db2qocfh',
      organizationPublicId: null,
    });

    const [firstOptions, secondOptions] = addMock.mock.calls.map((call) => call[2]);
    expect(firstOptions).not.toEqual(secondOptions);
  });
});
