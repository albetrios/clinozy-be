import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOrganizationsWithQueuedMessages: vi.fn(),
  findOrganizationsWithPendingDayCloseSummaries: vi.fn(),
  findOrganizationsWithPendingMessagingEvents: vi.fn(),
  enqueueContactMessageDelivery: vi.fn(),
  enqueueMessagingWebhookEventProcessing: vi.fn(),
  isMessagingDeliveryEnabled: vi.fn(),
  isMetaWebhookIngressConfigured: vi.fn(),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runGlobalRetentionWorkerJob: (work: (handle: unknown) => unknown) => work({ kind: 'retention' }),
}));
vi.mock('@/infrastructure/messaging/meta-messaging.config.js', () => ({
  isMessagingDeliveryEnabled: mocks.isMessagingDeliveryEnabled,
  isMetaWebhookIngressConfigured: mocks.isMetaWebhookIngressConfigured,
}));
vi.mock(
  '@/domains/app/sub-domains/contacts/contact-activities/contact-message-delivery.repository.js',
  () => ({ findOrganizationsWithQueuedMessages: mocks.findOrganizationsWithQueuedMessages }),
);
vi.mock('@/domains/app/sub-domains/billing/day-closes/day-close-summary.repository.js', () => ({
  findOrganizationsWithPendingDayCloseSummaries:
    mocks.findOrganizationsWithPendingDayCloseSummaries,
}));
vi.mock(
  '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.repository.js',
  () => ({
    findOrganizationsWithPendingMessagingEvents: mocks.findOrganizationsWithPendingMessagingEvents,
  }),
);
vi.mock(
  '@/domains/app/sub-domains/contacts/contact-activities/queues/contact-message-delivery.queue.js',
  () => ({ enqueueContactMessageDelivery: mocks.enqueueContactMessageDelivery }),
);
vi.mock(
  '@/domains/app/sub-domains/contacts/contact-messaging-webhook/queues/messaging-webhook-event.queue.js',
  () => ({ enqueueMessagingWebhookEventProcessing: mocks.enqueueMessagingWebhookEventProcessing }),
);
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runContactMessagingSweepJob } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/workers/contact-messaging-sweep.processor.js';

/** An organization row of a sweep read. */
const organization = (id: number) => ({ id, publicId: `org_${String(id).padStart(21, 'a')}` });

/** The one-minute messaging sweep (D77; D78 day-close summaries). */
describe('runContactMessagingSweepJob', () => {
  beforeEach(() => {
    for (const method of Object.values(mocks)) method.mockReset();
    mocks.isMessagingDeliveryEnabled.mockReturnValue(true);
    mocks.isMetaWebhookIngressConfigured.mockReturnValue(true);
    mocks.findOrganizationsWithQueuedMessages.mockResolvedValue([organization(1), organization(3)]);
    mocks.findOrganizationsWithPendingDayCloseSummaries.mockResolvedValue([
      organization(2),
      organization(3),
    ]);
    mocks.findOrganizationsWithPendingMessagingEvents.mockResolvedValue([organization(4)]);
    mocks.enqueueContactMessageDelivery.mockResolvedValue(undefined);
    mocks.enqueueMessagingWebhookEventProcessing.mockResolvedValue(undefined);
  });

  it('a delivery job per organization with a queued message or a pending summary, each once', async () => {
    expect(await runContactMessagingSweepJob()).toEqual({
      deliveryEnqueuedCount: 3,
      eventEnqueuedCount: 1,
      failedCount: 0,
    });
    expect(mocks.enqueueContactMessageDelivery.mock.calls.map((call) => call[0])).toEqual([
      organization(1).publicId,
      organization(2).publicId,
      organization(3).publicId,
    ]);
  });

  it('a channel that is off does nothing; a refused add is counted', async () => {
    mocks.isMessagingDeliveryEnabled.mockReturnValue(false);
    mocks.enqueueMessagingWebhookEventProcessing.mockRejectedValueOnce(new Error('redis down'));

    expect(await runContactMessagingSweepJob()).toEqual({
      deliveryEnqueuedCount: 0,
      eventEnqueuedCount: 0,
      failedCount: 1,
    });
    expect(mocks.findOrganizationsWithQueuedMessages).not.toHaveBeenCalled();
  });
});
