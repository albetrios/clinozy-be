import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  ProviderOutageError,
  toProviderOutageError,
} from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import {
  type MetaMediaAttachment,
  sendInstagramAttachmentMessage,
  sendInstagramTextMessage,
  sendWhatsAppMediaMessage,
  sendWhatsAppTextMessage,
} from '@/infrastructure/messaging/meta-graph.client.js';
import { getDefaultS3ObjectStorageAdapter } from '@/infrastructure/storage/s3-adapter.js';
import { resolveStoredMediaReadUrl } from '@/shared/utils/infrastructure/media-url.util.js';
import {
  findMetaGraphApiError,
  type MetaGraphApiError,
} from '@/infrastructure/messaging/meta-graph-error.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  type ClaimedContactMessage,
  createWorkerContactMessageDeliveryRepository,
  type MessagingOrganization,
} from '@/domains/app/sub-domains/contacts/contact-activities/contact-message-delivery.repository.js';
import { createWorkerDayCloseSummaryRepository } from '@/domains/app/sub-domains/billing/day-closes/day-close-summary.repository.js';
import { dayCloseSummaryBody } from '@/domains/app/sub-domains/billing/day-closes/day-close-summary.message.js';
import { requestContactMessageDelivery } from '@/domains/app/sub-domains/contacts/contact-activities/queues/contact-message-delivery.queue.js';
import {
  CONTACT_MESSAGE_DELIVERY_BATCH,
  CONTACT_MESSAGE_FAILURE_ATTACHMENT_MISSING,
  CONTACT_MESSAGE_FAILURE_INSTAGRAM_NOT_CONNECTED,
  CONTACT_MESSAGE_FAILURE_NO_INSTAGRAM_CONVERSATION,
  CONTACT_MESSAGE_FAILURE_NOT_ON_WHATSAPP,
  CONTACT_MESSAGE_FAILURE_WHATSAPP_NOT_CONNECTED,
  CONTACT_MESSAGE_IMAGE_MIME_TYPES,
} from './contact-message-delivery.constants.js';

/**
 * What one delivery job did (its return value, logged as `contact-message-delivery.completed`).
 *
 * @remarks
 * - **Notes:** `sentCount` — messages Meta took; `failedCount` — messages refused (by Meta, or
 *   before any call: no account connected, not on WhatsApp, no Instagram conversation yet);
 *   `summaryCount` — closed days whose summary went to the admins (WC-10, D78).
 */
export interface ContactMessageDeliveryCounts {
  sentCount: number;
  failedCount: number;
  summaryCount: number;
}

/** A message's fate before any call: why it cannot go out, or `null` when it can. */
function refusalOf(
  message: ClaimedContactMessage,
  organization: MessagingOrganization,
): string | null {
  if (message.attachments.length < message.attachmentKeyCount) {
    return CONTACT_MESSAGE_FAILURE_ATTACHMENT_MISSING;
  }
  if (message.type === 'whatsapp') {
    if (organization.whatsappPhoneNumberId === null)
      return CONTACT_MESSAGE_FAILURE_WHATSAPP_NOT_CONNECTED;
    if (!message.isOnWhatsApp || message.primaryPhone === '')
      return CONTACT_MESSAGE_FAILURE_NOT_ON_WHATSAPP;
    return null;
  }
  if (organization.instagramAccountId === null)
    return CONTACT_MESSAGE_FAILURE_INSTAGRAM_NOT_CONNECTED;
  if (message.instagramRecipientId === null)
    return CONTACT_MESSAGE_FAILURE_NO_INSTAGRAM_CONVERSATION;
  return null;
}

/** The message's files as links Meta fetches them from — an image or a document each (WC-11). */
async function mediaOf(message: ClaimedContactMessage): Promise<MetaMediaAttachment[]> {
  const storage = getDefaultS3ObjectStorageAdapter();
  const media: MetaMediaAttachment[] = [];
  for (const attachment of message.attachments) {
    media.push({
      kind: CONTACT_MESSAGE_IMAGE_MIME_TYPES.has(attachment.mimeType) ? 'image' : 'document',
      // A short-lived signed link Meta fetches the file from (the media read TTL, 1 hour)
      url: String(await resolveStoredMediaReadUrl(storage, attachment.fileKey)),
      fileName: attachment.fileName,
    });
  }
  return media;
}

/**
 * Sends one WhatsApp message: its text, or — with files — each file as media, the text as the
 * first one's caption (WC-11). Answers the first message's id (its reports follow the entry).
 */
async function sendWhatsApp(
  message: ClaimedContactMessage,
  phoneNumberId: string,
  media: readonly MetaMediaAttachment[],
): Promise<string> {
  if (media.length === 0) {
    const sent = await sendWhatsAppTextMessage({
      phoneNumberId,
      to: message.primaryPhone,
      body: message.body,
    });
    return sent.providerMessageId;
  }
  let firstId: string | null = null;
  for (const attachment of media) {
    const sent = await sendWhatsAppMediaMessage({
      phoneNumberId,
      to: message.primaryPhone,
      attachment,
      ...(firstId === null ? { caption: message.body } : {}),
    });
    firstId ??= sent.providerMessageId;
  }
  return String(firstId);
}

/** Sends one Instagram message: its text, then each file (Instagram has no captions — WC-11). */
async function sendInstagram(
  message: ClaimedContactMessage,
  accountId: string,
  media: readonly MetaMediaAttachment[],
): Promise<string> {
  const recipientId = String(message.instagramRecipientId);
  const sent = await sendInstagramTextMessage({ accountId, recipientId, body: message.body });
  for (const attachment of media) {
    await sendInstagramAttachmentMessage({ accountId, recipientId, attachment });
  }
  return sent.providerMessageId;
}

/** Sends one message through the Graph API — the caller has ruled out every refusal. */
async function send(
  message: ClaimedContactMessage,
  organization: MessagingOrganization,
): Promise<string> {
  const media = await mediaOf(message);
  return message.type === 'whatsapp'
    ? sendWhatsApp(message, String(organization.whatsappPhoneNumberId), media)
    : sendInstagram(message, String(organization.instagramAccountId), media);
}

/** Meta throttling or down: the error that pauses the queue (or the one to retry). */
async function outageOf(error: unknown, graphError: MetaGraphApiError | null): Promise<unknown> {
  if (graphError?.isRateLimited) {
    return new ProviderOutageError({
      provider: 'meta',
      cause: error,
      retryAfterMs: graphError.retryAfterMs,
    });
  }
  return (await toProviderOutageError({ error, provider: 'meta' })) ?? error;
}

/** Sends the claimed messages one by one, each outcome written right after (WC-1, WC-2). */
async function sendClaimedMessages(options: {
  organizationPublicId: string;
  organization: MessagingOrganization;
  messages: readonly ClaimedContactMessage[];
  counts: ContactMessageDeliveryCounts;
}): Promise<void> {
  const { organizationPublicId, organization, messages, counts } = options;
  const write = (
    work: (
      repository: ReturnType<typeof createWorkerContactMessageDeliveryRepository>,
    ) => Promise<void>,
  ) =>
    runOrganizationScopedWorkerJob({ organizationPublicId }, (handle) =>
      work(createWorkerContactMessageDeliveryRepository(handle)),
    );

  for (const [index, message] of messages.entries()) {
    const refusal = refusalOf(message, organization);
    if (refusal !== null) {
      await write((repository) => repository.markFailed({ id: message.id, reason: refusal }));
      counts.failedCount += 1;
      continue;
    }
    try {
      const providerMessageId = await send(message, organization);
      await write((repository) => repository.markSent({ id: message.id, providerMessageId }));
      counts.sentCount += 1;
    } catch (error) {
      const graphError = findMetaGraphApiError(error);
      if (graphError?.isMessageRejection) {
        await write((repository) =>
          repository.markFailed({ id: message.id, reason: graphError.reason }),
        );
        counts.failedCount += 1;
        continue;
      }
      // Meta is throttling or down, or something else broke: every message not yet sent stays
      // queued for the next try.
      const unsent = messages.slice(index).map((pending) => pending.id);
      await write((repository) => repository.releaseClaims(unsent));
      throw await outageOf(error, graphError);
    }
  }
}

/**
 * WC-10 (D78): each closed day of the last 24 hours not summarised yet goes to the admins' numbers
 * as WhatsApp text, then is stamped — a number Meta refuses is skipped; a throttle or outage stops
 * here (the day stays pending; a number already sent may get it twice on the retry).
 */
async function sendDayCloseSummaries(options: {
  organizationPublicId: string;
  organization: MessagingOrganization;
}): Promise<number> {
  const { organizationPublicId, organization } = options;
  const phoneNumberId = organization.whatsappPhoneNumberId;
  if (phoneNumberId === null) return 0;
  const pending = await runOrganizationScopedWorkerJob({ organizationPublicId }, async (handle) => {
    const summaries = createWorkerDayCloseSummaryRepository(handle);
    const days = await summaries.findPending(organization.id);
    return {
      days,
      phones: days.length === 0 ? [] : await summaries.findRecipientPhones(organization.id),
    };
  });
  let summaryCount = 0;
  for (const day of pending.days) {
    const body = dayCloseSummaryBody(day);
    for (const phone of pending.phones) {
      try {
        await sendWhatsAppTextMessage({ phoneNumberId, to: phone, body });
      } catch (error) {
        const graphError = findMetaGraphApiError(error);
        if (!graphError?.isMessageRejection) throw await outageOf(error, graphError);
        logger.warn(
          { organizationPublicId, dayCloseId: day.id, reason: graphError.reason },
          'day-close-summary.recipient_refused',
        );
      }
    }
    await runOrganizationScopedWorkerJob({ organizationPublicId }, (handle) =>
      createWorkerDayCloseSummaryRepository(handle).markSent(day.id),
    );
    summaryCount += 1;
  }
  return summaryCount;
}

/**
 * One organization's message delivery (launch D77, WC-1, WC-2): claims its oldest queued WhatsApp
 * and Instagram messages and sends each through the platform Meta app; then the day-close
 * summaries waiting for the admins (D78, WC-10).
 *
 * @remarks
 * - **Algorithm:** a short organization context reads the clinic's accounts and claims a batch
 *   (`delivery_claimed_at`); the context closes; each message is then refused (no number
 *   connected, not on WhatsApp, no Instagram conversation yet) or sent, and its outcome written
 *   in its own short context right after — `sent` with Meta's id, or `failed` with the reason for
 *   a refusal Meta or the setup gave. Then each closed day not summarised goes to the admins and
 *   is stamped. A full batch asks for the next job.
 * - **Failure modes:** a throttle or an outage of Meta (the `meta` circuit opening) releases every
 *   claim still held — those messages stay `queued`, never dropped — and throws a
 *   {@link ProviderOutageError} so the queue pauses (`createProviderPausableWorker`); any other
 *   error releases the claims and propagates (BullMQ retries).
 * - **Side effects:** Graph API sends; `contact_activities` and `day_closes` updates; possibly a
 *   follow-up job.
 * - **Notes:** no Graph call ever runs inside a database context. A crash between a send and its
 *   write leaves the claim to go stale (5 minutes) — the narrow window in which a message could
 *   be sent twice.
 */
export async function runContactMessageDeliveryJob(
  organizationPublicId: string,
): Promise<ContactMessageDeliveryCounts> {
  const claimed = await runOrganizationScopedWorkerJob({ organizationPublicId }, async (handle) => {
    const repository = createWorkerContactMessageDeliveryRepository(handle);
    const organization = await repository.findOrganization(organizationPublicId);
    if (!organization) return null;
    const messages = await repository.claimBatch({
      organizationId: organization.id,
      limit: CONTACT_MESSAGE_DELIVERY_BATCH,
    });
    return { organization, messages };
  });
  const counts: ContactMessageDeliveryCounts = { sentCount: 0, failedCount: 0, summaryCount: 0 };
  if (!claimed) return counts;
  const { organization, messages } = claimed;
  await sendClaimedMessages({ organizationPublicId, organization, messages, counts });
  counts.summaryCount = await sendDayCloseSummaries({ organizationPublicId, organization });
  if (messages.length === CONTACT_MESSAGE_DELIVERY_BATCH) {
    await requestContactMessageDelivery(organizationPublicId);
  }
  if (messages.length > 0 || counts.summaryCount > 0) {
    logger.info({ organizationPublicId, ...counts }, 'contact-message-delivery.completed');
  }
  return counts;
}
