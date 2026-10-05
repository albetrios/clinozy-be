import { describe, it, expect, vi, beforeEach } from 'vitest';

const addMock = vi.fn().mockResolvedValue({ id: 'job-1' });

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = addMock;
    close = vi.fn();
    client = Promise.resolve({ ping: async () => 'PONG' });
  },
}));

vi.mock('@/infrastructure/queue/connection.js', () => ({
  getBullMQKeyPrefix: () => 'test:bull',
  getBullMQConnectionOptions: () => ({}),
  getBullMQProducerConnectionOptions: () => ({ enableOfflineQueue: false }),
}));

describe('Integration: trace context propagation to BullMQ', () => {
  beforeEach(async () => {
    addMock.mockClear();
    vi.resetModules();
  });

  it('should include requestId in notification job payload when provided', async () => {
    const { enqueueNotification } = await import(
      '@/domains/notify/sub-domains/notification/queues/notification.queue.js'
    );
    await enqueueNotification({
      notificationPublicId: 'ntf_9z3rura5kqvcv8zggriym',
      organizationPublicId: 'org_public_123',
      userPublicId: 'usr_0y8vf3ktxqnhcm1ze21ab',
      requestId: 'req-correlation-abc',
    });

    expect(addMock).toHaveBeenCalledWith(
      'dispatch-notification',
      expect.objectContaining({
        notificationPublicId: 'ntf_9z3rura5kqvcv8zggriym',
        organizationPublicId: 'org_public_123',
        requestId: 'req-correlation-abc',
      }),
      // enqueueNotification dedupes on a stable jobId (audit PR-5, commit f5649a2) so a
      // redelivery of the same persisted notification is a BullMQ no-op — the notification's
      // public id, which stays unique when the bigserial restarts.
      expect.objectContaining({ jobId: 'ntf_9z3rura5kqvcv8zggriym' }),
    );
  });
});
