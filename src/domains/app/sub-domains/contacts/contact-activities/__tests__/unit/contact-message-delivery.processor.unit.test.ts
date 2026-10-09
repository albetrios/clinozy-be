import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaGraphApiError } from '@/infrastructure/messaging/meta-graph-error.util.js';

const mocks = vi.hoisted(() => ({
  repository: {
    findOrganization: vi.fn(),
    claimBatch: vi.fn(),
    markSent: vi.fn(),
    markFailed: vi.fn(),
    releaseClaims: vi.fn(),
  },
  summaries: { findPending: vi.fn(), findRecipientPhones: vi.fn(), markSent: vi.fn() },
  sendWhatsAppTextMessage: vi.fn(),
  sendWhatsAppMediaMessage: vi.fn(),
  sendInstagramTextMessage: vi.fn(),
  sendInstagramAttachmentMessage: vi.fn(),
  requestContactMessageDelivery: vi.fn(),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runOrganizationScopedWorkerJob: (_options: unknown, work: (handle: unknown) => unknown) =>
    work({ kind: 'organization' }),
}));
vi.mock('@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js', () => {
  class ProviderOutageError extends Error {
    constructor(readonly options: Record<string, unknown>) {
      super('provider outage');
    }
  }
  return { ProviderOutageError, toProviderOutageError: async () => null };
});
vi.mock('@/infrastructure/messaging/meta-graph.client.js', () => ({
  sendWhatsAppTextMessage: mocks.sendWhatsAppTextMessage,
  sendWhatsAppMediaMessage: mocks.sendWhatsAppMediaMessage,
  sendInstagramTextMessage: mocks.sendInstagramTextMessage,
  sendInstagramAttachmentMessage: mocks.sendInstagramAttachmentMessage,
}));
vi.mock('@/infrastructure/storage/s3-adapter.js', () => ({
  getDefaultS3ObjectStorageAdapter: () => ({}),
}));
vi.mock('@/shared/utils/infrastructure/media-url.util.js', () => ({
  resolveStoredMediaReadUrl: async (_storage: unknown, key: string) => `https://signed.test/${key}`,
}));
vi.mock(
  '@/domains/app/sub-domains/contacts/contact-activities/contact-message-delivery.repository.js',
  () => ({ createWorkerContactMessageDeliveryRepository: () => mocks.repository }),
);
vi.mock('@/domains/app/sub-domains/billing/day-closes/day-close-summary.repository.js', () => ({
  createWorkerDayCloseSummaryRepository: () => mocks.summaries,
}));
vi.mock(
  '@/domains/app/sub-domains/contacts/contact-activities/queues/contact-message-delivery.queue.js',
  () => ({ requestContactMessageDelivery: mocks.requestContactMessageDelivery }),
);
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runContactMessageDeliveryJob } from '@/domains/app/sub-domains/contacts/contact-activities/workers/contact-message-delivery.processor.js';
import { CONTACT_MESSAGE_DELIVERY_BATCH } from '@/domains/app/sub-domains/contacts/contact-activities/workers/contact-message-delivery.constants.js';

const ORGANIZATION = 'org_aaaaaaaaaaaaaaaaaaaa1';

/** A claimed queued message. */
function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    publicId: 'cact_aaaaaaaaaaaaaaaaaaaa1',
    type: 'whatsapp',
    body: 'Hi Asha',
    contactId: 5,
    primaryPhone: '+919800000001',
    isOnWhatsApp: true,
    instagramRecipientId: null,
    attachments: [],
    attachmentKeyCount: 0,
    ...overrides,
  };
}

/** A Graph error answer. */
function graphError(statusCode: number, code: number): MetaGraphApiError {
  return new MetaGraphApiError({
    statusCode,
    body: JSON.stringify({ error: { message: `(#${code}) refused`, code } }),
    retryAfterSeconds: null,
  });
}

/** One organization's delivery job (D77 WC-1, WC-2; D78 WC-10, WC-11). */
describe('runContactMessageDeliveryJob', () => {
  const { repository, summaries } = mocks;

  beforeEach(() => {
    for (const method of [
      ...Object.values(repository),
      ...Object.values(summaries),
      mocks.sendWhatsAppTextMessage,
      mocks.sendWhatsAppMediaMessage,
      mocks.sendInstagramTextMessage,
      mocks.sendInstagramAttachmentMessage,
      mocks.requestContactMessageDelivery,
    ]) {
      method.mockReset();
    }
    repository.findOrganization.mockResolvedValue({
      id: 7,
      whatsappPhoneNumberId: '1012345678',
      instagramAccountId: '1712345678',
    });
    summaries.findPending.mockResolvedValue([]);
    mocks.sendWhatsAppTextMessage.mockResolvedValue({ providerMessageId: 'wamid.text' });
  });

  it('sends a WhatsApp text and writes it sent with Meta’s id', async () => {
    repository.claimBatch.mockResolvedValue([message()]);

    expect(await runContactMessageDeliveryJob(ORGANIZATION)).toEqual({
      sentCount: 1,
      failedCount: 0,
      summaryCount: 0,
    });
    expect(mocks.sendWhatsAppTextMessage).toHaveBeenCalledWith({
      phoneNumberId: '1012345678',
      to: '+919800000001',
      body: 'Hi Asha',
    });
    expect(repository.markSent).toHaveBeenCalledWith({ id: 1, providerMessageId: 'wamid.text' });
  });

  it('refuses before any call: no Instagram conversation, a file gone, not on WhatsApp', async () => {
    repository.claimBatch.mockResolvedValue([
      message({ id: 1, type: 'instagram' }),
      message({ id: 2, attachmentKeyCount: 1 }),
      message({ id: 3, isOnWhatsApp: false }),
    ]);

    expect((await runContactMessageDeliveryJob(ORGANIZATION)).failedCount).toBe(3);
    expect(repository.markFailed.mock.calls.map((call) => call[0].reason)).toEqual([
      'No Instagram conversation with this person yet — they need to message the clinic first',
      'One of the attached files is no longer available — attach it again',
      "This person's number is not on WhatsApp",
    ]);
    expect(mocks.sendWhatsAppTextMessage).not.toHaveBeenCalled();
  });

  it('Meta refusing one message fails it with Meta’s words and goes on', async () => {
    repository.claimBatch.mockResolvedValue([message({ id: 1 }), message({ id: 2 })]);
    mocks.sendWhatsAppTextMessage
      .mockRejectedValueOnce(graphError(400, 131_026))
      .mockResolvedValueOnce({ providerMessageId: 'wamid.two' });

    expect(await runContactMessageDeliveryJob(ORGANIZATION)).toEqual({
      sentCount: 1,
      failedCount: 1,
      summaryCount: 0,
    });
    expect(repository.markFailed.mock.calls[0]?.[0].reason).toContain('refused');
  });

  it('a throttle releases every claim not sent yet and pauses the queue', async () => {
    repository.claimBatch.mockResolvedValue([
      message({ id: 1 }),
      message({ id: 2 }),
      message({ id: 3 }),
    ]);
    mocks.sendWhatsAppTextMessage
      .mockResolvedValueOnce({ providerMessageId: 'wamid.one' })
      .mockRejectedValueOnce(graphError(429, 130_429));

    await expect(runContactMessageDeliveryJob(ORGANIZATION)).rejects.toThrow('provider outage');
    expect(repository.releaseClaims).toHaveBeenCalledWith([2, 3]);
  });

  it('WC-11: files go as WhatsApp media — the text the first caption — or after the Instagram text', async () => {
    const files = [
      { fileKey: 'k/rx.pdf', mimeType: 'application/pdf', fileName: 'rx.pdf' },
      { fileKey: 'k/after.jpg', mimeType: 'image/jpeg', fileName: 'after.jpg' },
    ];
    repository.claimBatch.mockResolvedValue([
      message({ id: 1, attachments: files, attachmentKeyCount: 2 }),
      message({
        id: 2,
        type: 'instagram',
        instagramRecipientId: 'igsid-1',
        attachments: [files[1]],
        attachmentKeyCount: 1,
      }),
    ]);
    mocks.sendWhatsAppMediaMessage
      .mockResolvedValueOnce({ providerMessageId: 'wamid.doc' })
      .mockResolvedValueOnce({ providerMessageId: 'wamid.img' });
    mocks.sendInstagramTextMessage.mockResolvedValue({ providerMessageId: 'mid.text' });
    mocks.sendInstagramAttachmentMessage.mockResolvedValue({ providerMessageId: 'mid.img' });

    await runContactMessageDeliveryJob(ORGANIZATION);

    expect(mocks.sendWhatsAppMediaMessage.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({
        attachment: { kind: 'document', url: 'https://signed.test/k/rx.pdf', fileName: 'rx.pdf' },
        caption: 'Hi Asha',
      }),
      expect.not.objectContaining({ caption: expect.anything() }),
    ]);
    expect(mocks.sendInstagramAttachmentMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'igsid-1',
        attachment: expect.objectContaining({ kind: 'image' }),
      }),
    );
    expect(repository.markSent.mock.calls.map((call) => call[0])).toEqual([
      { id: 1, providerMessageId: 'wamid.doc' },
      { id: 2, providerMessageId: 'mid.text' },
    ]);
  });

  it('WC-10: each pending day-close summary goes to the admins, a refused number is skipped', async () => {
    repository.claimBatch.mockResolvedValue([]);
    summaries.findPending.mockResolvedValue([
      {
        id: 41,
        branchName: 'Vesu',
        closeDate: '9 Oct',
        expectedCash: 100,
        countedCash: 100,
        closedByName: null,
        figures: {
          cash_in: 100,
          cash_out: 0,
          net: { cash: 100, upi: 0, card: 0, credit: 0 },
          entry_count: 1,
        },
      },
    ]);
    summaries.findRecipientPhones.mockResolvedValue(['+919800000090', '+919800000091']);
    mocks.sendWhatsAppTextMessage
      .mockRejectedValueOnce(graphError(400, 131_026))
      .mockResolvedValueOnce({ providerMessageId: 'wamid.summary' });

    expect((await runContactMessageDeliveryJob(ORGANIZATION)).summaryCount).toBe(1);
    expect(mocks.sendWhatsAppTextMessage).toHaveBeenCalledTimes(2);
    expect(summaries.markSent).toHaveBeenCalledWith(41);
  });

  it('a full batch asks for the next job; a gone organization does nothing', async () => {
    repository.claimBatch.mockResolvedValue(
      Array.from({ length: CONTACT_MESSAGE_DELIVERY_BATCH }, (_, index) =>
        message({ id: index + 1 }),
      ),
    );
    await runContactMessageDeliveryJob(ORGANIZATION);
    expect(mocks.requestContactMessageDelivery).toHaveBeenCalledWith(ORGANIZATION);

    repository.findOrganization.mockResolvedValue(null);
    expect(await runContactMessageDeliveryJob(ORGANIZATION)).toEqual({
      sentCount: 0,
      failedCount: 0,
      summaryCount: 0,
    });
  });
});
