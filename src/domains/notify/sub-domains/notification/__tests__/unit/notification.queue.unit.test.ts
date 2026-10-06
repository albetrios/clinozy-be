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

const USER_PUBLIC_ID = 'usr_0y8vf3ktxqnhcm1ze21ab';

describe('enqueueNotification', () => {
  beforeEach(() => {
    addMock.mockClear();
  });

  // audit #6: the enqueue must be idempotent per notification so a recovery/redelivery path
  // cannot dispatch (and email) the same notification twice.
  it('adds the job with the notification public id as its jobId for dedup', async () => {
    await enqueueNotification({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: 'org_public_id',
      userPublicId: USER_PUBLIC_ID,
      requestId: 'request-1',
    });

    expect(addMock).toHaveBeenCalledTimes(1);
    const [jobName, jobData, options] = addMock.mock.calls[0]!;
    expect(jobName).toBe('dispatch-notification');
    // Public ids only — the bigserial never reaches Redis.
    expect(jobData).toEqual({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: 'org_public_id',
      userPublicId: USER_PUBLIC_ID,
      requestId: 'request-1',
    });
    expect(options).toEqual({ jobId: NOTIFICATION_PUBLIC_ID });
  });

  it('carries the recipient public id for a notification without an organization', async () => {
    await enqueueNotification({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: null,
      userPublicId: USER_PUBLIC_ID,
    });

    const [, jobData, options] = addMock.mock.calls[0]!;
    expect(jobData).toEqual({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: null,
      userPublicId: USER_PUBLIC_ID,
    });
    expect(options).toEqual({ jobId: NOTIFICATION_PUBLIC_ID });
  });

  it('rejects a payload without the recipient at the producer boundary', async () => {
    await expect(
      enqueueNotification({
        notificationPublicId: NOTIFICATION_PUBLIC_ID,
        organizationPublicId: null,
        userPublicId: '',
      }),
    ).rejects.toThrow(/bullmq\.invalid_job_payload:notification/);
    expect(addMock).not.toHaveBeenCalled();
  });
});
