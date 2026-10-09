import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaGraphApiError } from '@/infrastructure/messaging/meta-graph-error.util.js';

const mocks = vi.hoisted(() => ({
  inbound: {
    findOrganizationId: vi.fn(),
    advanceDeliveryStatus: vi.fn(),
    findContactIdByPhone: vi.fn(),
    findContactIdByInstagramSender: vi.fn(),
    findContactIdByInstagramUsername: vi.fn(),
    createContactWithLead: vi.fn(),
    insertReceivedMessage: vi.fn(),
    confirmBookingByReply: vi.fn(),
  },
  events: {
    claimBatch: vi.fn(),
    markProcessed: vi.fn(),
    recordFailure: vi.fn(),
    releaseClaims: vi.fn(),
  },
  fetchInstagramUsername: vi.fn(),
  requestMessagingWebhookEventProcessing: vi.fn(),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runOrganizationScopedWorkerJob: (_options: unknown, work: (handle: unknown) => unknown) =>
    work({ kind: 'organization' }),
}));
vi.mock('@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js', () => ({
  toProviderOutageError: async () => new Error('provider outage'),
}));
vi.mock('@/infrastructure/messaging/meta-graph.client.js', () => ({
  fetchInstagramUsername: mocks.fetchInstagramUsername,
}));
vi.mock(
  '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-inbound.repository.js',
  () => ({ createWorkerContactMessagingInboundRepository: () => mocks.inbound }),
);
vi.mock(
  '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.repository.js',
  () => ({ createWorkerContactMessagingWebhookRepository: () => mocks.events }),
);
vi.mock(
  '@/domains/app/sub-domains/contacts/contact-messaging-webhook/queues/messaging-webhook-event.queue.js',
  () => ({ requestMessagingWebhookEventProcessing: mocks.requestMessagingWebhookEventProcessing }),
);
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runMessagingWebhookEventJob } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/workers/messaging-webhook-event.processor.js';

const ORGANIZATION = 'org_aaaaaaaaaaaaaaaaaaaa1';

/** A stored WhatsApp change. */
function whatsAppEvent(id: number, value: Record<string, unknown>) {
  return { id, channel: 'whatsapp', payload: value, attemptCount: 0 };
}

/** A stored Instagram message from `senderId`. */
function instagramEvent(id: number, senderId: string) {
  return {
    id,
    channel: 'instagram',
    payload: {
      sender: { id: senderId },
      timestamp: 1,
      message: { mid: `mid.${id}`, text: 'hello' },
    },
    attemptCount: 0,
  };
}

/** Applying an organization's stored callbacks (D77 WC-1, WC-3; D78 WC-8). */
describe('runMessagingWebhookEventJob', () => {
  const { inbound, events } = mocks;

  beforeEach(() => {
    for (const method of [
      ...Object.values(inbound),
      ...Object.values(events),
      mocks.fetchInstagramUsername,
      mocks.requestMessagingWebhookEventProcessing,
    ]) {
      method.mockReset();
    }
    inbound.findOrganizationId.mockResolvedValue(7);
    inbound.insertReceivedMessage.mockResolvedValue(true);
  });

  it('moves a report forward, adds a reply, and a "Yes" confirms the booking', async () => {
    events.claimBatch.mockResolvedValue([
      whatsAppEvent(1, { statuses: [{ id: 'wamid.1', status: 'delivered', timestamp: '1' }] }),
      whatsAppEvent(2, {
        messages: [
          {
            from: '919800000001',
            id: 'wamid.in',
            timestamp: '1',
            type: 'text',
            text: { body: 'Yes 👍' },
          },
        ],
      }),
    ]);
    inbound.findContactIdByPhone.mockResolvedValue(5);

    expect(await runMessagingWebhookEventJob(ORGANIZATION)).toEqual({
      processedCount: 2,
      failedCount: 0,
    });
    expect(inbound.advanceDeliveryStatus).toHaveBeenCalledWith(
      expect.objectContaining({ providerMessageId: 'wamid.1', status: 'delivered' }),
    );
    expect(inbound.insertReceivedMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 5, body: 'Yes 👍' }),
    );
    expect(inbound.confirmBookingByReply).toHaveBeenCalledWith({ organizationId: 7, contactId: 5 });
    expect(events.markProcessed.mock.calls.map((call) => call[0])).toEqual([1, 2]);
  });

  it('an unknown number becomes a contact with a lead; a retried reply confirms nothing again', async () => {
    events.claimBatch.mockResolvedValue([
      whatsAppEvent(3, {
        contacts: [{ wa_id: '919800000099', profile: { name: 'Riya' } }],
        messages: [
          {
            from: '919800000099',
            id: 'wamid.new',
            timestamp: '1',
            type: 'text',
            text: { body: 'yes' },
          },
        ],
      }),
    ]);
    inbound.findContactIdByPhone.mockResolvedValue(null);
    inbound.createContactWithLead.mockResolvedValue(9);
    inbound.insertReceivedMessage.mockResolvedValue(false);

    await runMessagingWebhookEventJob(ORGANIZATION);

    expect(inbound.createContactWithLead).toHaveBeenCalledWith({
      organizationId: 7,
      phone: '+919800000099',
      firstName: 'Riya',
    });
    expect(inbound.confirmBookingByReply).not.toHaveBeenCalled();
  });

  it('an Instagram stranger is looked up by username; Meta down releases the claims', async () => {
    events.claimBatch.mockResolvedValue([instagramEvent(4, 'igsid-1')]);
    inbound.findContactIdByInstagramSender.mockResolvedValue(null);
    mocks.fetchInstagramUsername.mockResolvedValue('bela.glow');
    inbound.findContactIdByInstagramUsername.mockResolvedValue(6);

    await runMessagingWebhookEventJob(ORGANIZATION);
    expect(inbound.insertReceivedMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 6, providerSenderId: 'igsid-1' }),
    );

    mocks.fetchInstagramUsername.mockRejectedValue(new Error('network'));
    await expect(runMessagingWebhookEventJob(ORGANIZATION)).rejects.toThrow('provider outage');
    expect(events.releaseClaims).toHaveBeenCalledWith([4]);
  });

  it('a lookup Meta refuses leaves the sender unknown — the message is dropped', async () => {
    events.claimBatch.mockResolvedValue([instagramEvent(5, 'igsid-2')]);
    inbound.findContactIdByInstagramSender.mockResolvedValue(null);
    mocks.fetchInstagramUsername.mockRejectedValue(
      new MetaGraphApiError({
        statusCode: 400,
        body: JSON.stringify({ error: { message: 'no user', code: 100 } }),
        retryAfterSeconds: null,
      }),
    );

    expect((await runMessagingWebhookEventJob(ORGANIZATION)).processedCount).toBe(1);
    expect(inbound.insertReceivedMessage).not.toHaveBeenCalled();
  });

  it('an update that fails is counted and the rest go on', async () => {
    events.claimBatch.mockResolvedValue([
      whatsAppEvent(6, { statuses: [{ id: 'wamid.6', status: 'read', timestamp: '1' }] }),
      whatsAppEvent(7, { statuses: [{ id: 'wamid.7', status: 'read', timestamp: '1' }] }),
    ]);
    inbound.advanceDeliveryStatus
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValue(true);

    expect(await runMessagingWebhookEventJob(ORGANIZATION)).toEqual({
      processedCount: 1,
      failedCount: 1,
    });
    expect(events.recordFailure).toHaveBeenCalledWith({ id: 6, reason: 'deadlock' });
  });
});
