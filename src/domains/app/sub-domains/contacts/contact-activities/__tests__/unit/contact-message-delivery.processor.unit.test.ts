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
  sendWhatsAppTemplateMessage: vi.fn(),
  isWhatsAppTemplatesEnabled: vi.fn(),
  sendInstagramTextMessage: vi.fn(),
  sendInstagramAttachmentMessage: vi.fn(),
  requestContactMessageDelivery: vi.fn(),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runOrganizationScopedWorkerJob: ({
    processor,
  }: {
    processor: (handle: unknown, job: unknown) => unknown;
  }) => processor({ kind: 'organization' }, {}),
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
  sendWhatsAppTemplateMessage: mocks.sendWhatsAppTemplateMessage,
  sendInstagramTextMessage: mocks.sendInstagramTextMessage,
  sendInstagramAttachmentMessage: mocks.sendInstagramAttachmentMessage,
}));
vi.mock('@/infrastructure/messaging/meta-messaging.config.js', () => ({
  isWhatsAppTemplatesEnabled: mocks.isWhatsAppTemplatesEnabled,
}));
vi.mock('@/infrastructure/storage/s3-adapter.js', () => ({
  getDefaultS3ObjectStorageAdapter: () => ({}),
}));
vi.mock('@/shared/utils/infrastructure/media-url.util.js', () => ({
  resolveStoredMediaReadUrl: async ({ storedValue: key }: { storedValue: string }) =>
    `https://signed.test/${key}`,
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
    automationKind: null,
    templateParameters: [],
    lastReceivedAt: null,
    areNoticesStopped: false,
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
      mocks.sendWhatsAppTemplateMessage,
      mocks.isWhatsAppTemplatesEnabled,
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
    mocks.sendWhatsAppTemplateMessage.mockResolvedValue({ providerMessageId: 'wamid.template' });
    mocks.isWhatsAppTemplatesEnabled.mockReturnValue(false);
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

  it('D32: a notice to someone who replied STOP is refused; the team’s own message still goes', async () => {
    repository.claimBatch.mockResolvedValue([
      message({ id: 1, automationKind: 'payment_receipt', areNoticesStopped: true }),
      message({ id: 2, areNoticesStopped: true }),
    ]);

    expect(await runContactMessageDeliveryJob(ORGANIZATION)).toEqual({
      sentCount: 1,
      failedCount: 1,
      summaryCount: 0,
    });
    expect(repository.markFailed).toHaveBeenCalledWith({
      id: 1,
      reason: 'This person replied STOP to automated messages — the team can still write to them',
    });
    expect(repository.markSent).toHaveBeenCalledWith({ id: 2, providerMessageId: 'wamid.text' });
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

  describe('D32: notices outside the 24-hour window go as their approved template', () => {
    const reminder = (overrides: Record<string, unknown> = {}) =>
      message({
        body: 'Hi Asha, a reminder of your visit at Vesu tomorrow, 12 Oct at 10:30. Reply YES to confirm.',
        automationKind: 'booking_reminder',
        templateParameters: ['Asha', 'Vesu', '12 Oct', '10:30'],
        ...overrides,
      });

    beforeEach(() => {
      mocks.isWhatsAppTemplatesEnabled.mockReturnValue(true);
    });

    it('a notice to someone who never wrote: the template, and its text kept as the body', async () => {
      repository.claimBatch.mockResolvedValue([reminder()]);

      await runContactMessageDeliveryJob(ORGANIZATION);

      expect(mocks.sendWhatsAppTemplateMessage).toHaveBeenCalledWith({
        phoneNumberId: '1012345678',
        to: '+919800000001',
        template: expect.objectContaining({ name: 'booking_reminder', languageCode: 'en' }),
        parameters: ['Asha', 'Vesu', '12 Oct', '10:30'],
      });
      expect(mocks.sendWhatsAppTextMessage).not.toHaveBeenCalled();
      expect(repository.markSent).toHaveBeenCalledWith({
        id: 1,
        providerMessageId: 'wamid.template',
        body: 'Hi Asha, a reminder of your visit at Vesu tomorrow, 12 Oct at 10:30. Reply YES to confirm, or reply here to change it.',
      });
    });

    it('a notice to someone who wrote 25 hours ago: the template', async () => {
      repository.claimBatch.mockResolvedValue([
        reminder({ lastReceivedAt: new Date(Date.now() - 25 * 3_600_000) }),
      ]);

      await runContactMessageDeliveryJob(ORGANIZATION);

      expect(mocks.sendWhatsAppTemplateMessage).toHaveBeenCalledOnce();
    });

    it('free text inside the window, for a person, for a notice queued without parameters, or with files', async () => {
      repository.claimBatch.mockResolvedValue([
        reminder({ id: 1, lastReceivedAt: new Date(Date.now() - 3_600_000) }),
        message({ id: 2 }),
        reminder({ id: 3, templateParameters: [] }),
        reminder({
          id: 4,
          attachments: [{ fileKey: 'k/rx.pdf', mimeType: 'application/pdf', fileName: 'rx.pdf' }],
          attachmentKeyCount: 1,
        }),
      ]);
      mocks.sendWhatsAppMediaMessage.mockResolvedValue({ providerMessageId: 'wamid.doc' });

      await runContactMessageDeliveryJob(ORGANIZATION);

      expect(mocks.sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
      expect(mocks.sendWhatsAppTextMessage).toHaveBeenCalledTimes(3);
      expect(mocks.sendWhatsAppMediaMessage).toHaveBeenCalledOnce();
    });

    it('templates off: free text, whatever the window', async () => {
      mocks.isWhatsAppTemplatesEnabled.mockReturnValue(false);
      repository.claimBatch.mockResolvedValue([reminder()]);

      await runContactMessageDeliveryJob(ORGANIZATION);

      expect(mocks.sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
      expect(repository.markSent).toHaveBeenCalledWith({ id: 1, providerMessageId: 'wamid.text' });
    });

    it('a template Meta refuses fails the notice with its words (not approved yet)', async () => {
      repository.claimBatch.mockResolvedValue([reminder()]);
      mocks.sendWhatsAppTemplateMessage.mockRejectedValueOnce(graphError(404, 132_001));

      expect((await runContactMessageDeliveryJob(ORGANIZATION)).failedCount).toBe(1);
      expect(repository.markFailed.mock.calls[0]?.[0].reason).toContain('refused');
    });

    it('WC-10: the admins get the day-close summary as its template', async () => {
      repository.claimBatch.mockResolvedValue([]);
      summaries.findPending.mockResolvedValue([
        {
          id: 41,
          branchName: 'Vesu',
          closeDate: '9 Oct',
          expectedCash: 100,
          countedCash: 90,
          closedByName: 'Riya',
          figures: {
            cash_in: 100,
            cash_out: 0,
            net: { cash: 100, upi: 50, card: 0, credit: 0 },
            entry_count: 3,
          },
        },
      ]);
      summaries.findRecipientPhones.mockResolvedValue(['+919800000090']);

      expect((await runContactMessageDeliveryJob(ORGANIZATION)).summaryCount).toBe(1);
      expect(mocks.sendWhatsAppTextMessage).not.toHaveBeenCalled();
      expect(mocks.sendWhatsAppTemplateMessage.mock.calls[0]?.[0]).toMatchObject({
        to: '+919800000090',
        template: { name: 'day_close_summary' },
        parameters: [
          'Vesu',
          '9 Oct',
          '₹150.00',
          '₹100.00',
          '₹50.00',
          '₹0.00',
          '₹90.00',
          '₹100.00',
          '₹10.00 short',
          '3 entries',
          'closed by Riya',
        ],
      });
    });
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
