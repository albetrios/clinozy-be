import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findStalePendingDeliveryAttemptsMock, enqueueWebhookDeliveryMock, loggerMock } = vi.hoisted(
  () => ({
    findStalePendingDeliveryAttemptsMock: vi.fn(),
    enqueueWebhookDeliveryMock: vi.fn(),
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }),
);

vi.mock(
  '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js',
  () => ({ findStalePendingDeliveryAttempts: findStalePendingDeliveryAttemptsMock }),
);
vi.mock(
  '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js',
  () => ({ enqueueWebhookDelivery: enqueueWebhookDeliveryMock }),
);
// The global-retention runner hands the read a database handle; the adds must run after it returns.
vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runGlobalRetentionWorkerJob: (processor: (databaseHandle: unknown) => Promise<unknown>) =>
    processor('global-retention-database-handle'),
}));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({ logger: loggerMock }));

import { runWebhookDeliveryReclaimJob } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-reclaim.processor.js';
import {
  WEBHOOK_DELIVERY_RECLAIM_BATCH_SIZE,
  WEBHOOK_DELIVERY_RECLAIM_STALE_AFTER_MS,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-reclaim.constants.js';

const STALE_ATTEMPTS = [
  { deliveryAttemptPublicId: 'wda_first', organizationPublicId: 'org_first' },
  { deliveryAttemptPublicId: 'wda_second', organizationPublicId: 'org_second' },
];

/**
 * The webhook-delivery reclaim sweep: a delivery whose enqueue failed (Redis refused the write) or
 * whose process died between the commit and the enqueue sits PENDING with no job. The sweep finds
 * those and hands them back to the delivery queue, under each attempt's own organization.
 */
describe('runWebhookDeliveryReclaimJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueWebhookDeliveryMock.mockResolvedValue(undefined);
  });

  it('reads one bounded batch of attempts still PENDING past the stale window, under the global-retention scope', async () => {
    findStalePendingDeliveryAttemptsMock.mockResolvedValue([]);
    const now = new Date('2026-10-06T12:00:00.000Z');

    await runWebhookDeliveryReclaimJob({ now });

    expect(findStalePendingDeliveryAttemptsMock).toHaveBeenCalledExactlyOnceWith(
      'global-retention-database-handle',
      {
        createdBefore: new Date(now.getTime() - WEBHOOK_DELIVERY_RECLAIM_STALE_AFTER_MS),
        limit: WEBHOOK_DELIVERY_RECLAIM_BATCH_SIZE,
      },
    );
    expect(enqueueWebhookDeliveryMock).not.toHaveBeenCalled();
  });

  it('hands every stale attempt back to the delivery queue under its own organization', async () => {
    findStalePendingDeliveryAttemptsMock.mockResolvedValue(STALE_ATTEMPTS);

    const result = await runWebhookDeliveryReclaimJob();

    // The job id is the attempt's public id, so an attempt whose job still exists is left alone.
    expect(enqueueWebhookDeliveryMock).toHaveBeenCalledWith({
      deliveryAttemptPublicId: 'wda_first',
      organizationPublicId: 'org_first',
      requestId: 'webhook-delivery-reclaim',
    });
    expect(enqueueWebhookDeliveryMock).toHaveBeenCalledWith({
      deliveryAttemptPublicId: 'wda_second',
      organizationPublicId: 'org_second',
      requestId: 'webhook-delivery-reclaim',
    });
    expect(result).toEqual({ scannedCount: 2, addedCount: 2 });
  });

  it('keeps going when one add fails — that attempt stays PENDING for the next sweep', async () => {
    findStalePendingDeliveryAttemptsMock.mockResolvedValue(STALE_ATTEMPTS);
    enqueueWebhookDeliveryMock.mockRejectedValueOnce(new Error('redis refused the write'));

    const result = await runWebhookDeliveryReclaimJob();

    expect(enqueueWebhookDeliveryMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ scannedCount: 2, addedCount: 1 });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryAttemptPublicId: 'wda_first' }),
      'webhook-delivery-reclaim.enqueue.failed',
    );
  });

  it('lets a failed read reach BullMQ, so the run is retried', async () => {
    findStalePendingDeliveryAttemptsMock.mockRejectedValue(new Error('database unavailable'));

    await expect(runWebhookDeliveryReclaimJob()).rejects.toThrow('database unavailable');
    expect(enqueueWebhookDeliveryMock).not.toHaveBeenCalled();
  });
});
