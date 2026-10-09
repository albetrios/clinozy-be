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
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage,
} from '@/infrastructure/messaging/meta-graph.client.js';
import { isWhatsAppTemplatesEnabled } from '@/infrastructure/messaging/meta-messaging.config.js';
import { getDefaultS3ObjectStorageAdapter } from '@/infrastructure/storage/s3-adapter.js';
import { resolveStoredMediaReadUrl } from '@/shared/utils/infrastructure/media-url.util.js';
import {
  findMetaGraphApiError,
  type MetaGraphApiError,
} from '@/infrastructure/messaging/meta-graph-error.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { recordAutomatedNotice } from '@/infrastructure/observability/metrics/prometheus-metrics.js';
import {
  type ClaimedContactMessage,
  createWorkerContactMessageDeliveryRepository,
  type MessagingOrganization,
} from '@/domains/app/sub-domains/contacts/contact-activities/contact-message-delivery.repository.js';
import { createWorkerDayCloseSummaryRepository } from '@/domains/app/sub-domains/billing/day-closes/day-close-summary.repository.js';
import {
  dayCloseSummaryBody,
  dayCloseSummaryParameters,
} from '@/domains/app/sub-domains/billing/day-closes/day-close-summary.message.js';
import {
  isOutsideServiceWindow,
  renderWhatsAppTemplate,
  templateParameterCount,
  WHATSAPP_DAY_CLOSE_SUMMARY_TEMPLATE,
  WHATSAPP_NOTICE_TEMPLATES,
  type WhatsAppNoticeTemplate,
} from '@/domains/app/sub-domains/contacts/contact-activities/whatsapp-notice-templates.js';
import { requestContactMessageDelivery } from '@/domains/app/sub-domains/contacts/contact-activities/queues/contact-message-delivery.queue.js';
import {
  CONTACT_MESSAGE_DELIVERY_BATCH,
  CONTACT_MESSAGE_FAILURE_ATTACHMENT_MISSING,
  CONTACT_MESSAGE_FAILURE_INSTAGRAM_NOT_CONNECTED,
  CONTACT_MESSAGE_FAILURE_NO_INSTAGRAM_CONVERSATION,
  CONTACT_MESSAGE_FAILURE_NOT_ON_WHATSAPP,
  CONTACT_MESSAGE_FAILURE_NOTICES_STOPPED,
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
  if (message.automationKind !== null && message.areNoticesStopped) {
    return CONTACT_MESSAGE_FAILURE_NOTICES_STOPPED;
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

/** What one send did: Meta's id, and the template's text when it went as one (D32). */
interface SentOutcome {
  providerMessageId: string;
  templateBody?: string;
}

/**
 * D32: the template an automated notice goes as — templates on, no files, the person silent for
 * 24 hours or more, and the notice carrying its template's parameters (one queued before them goes
 * as free text). Null for free text.
 */
function noticeTemplateOf(
  message: ClaimedContactMessage,
  media: readonly MetaMediaAttachment[],
): WhatsAppNoticeTemplate | null {
  if (!isWhatsAppTemplatesEnabled() || message.automationKind === null || media.length > 0) {
    return null;
  }
  if (!isOutsideServiceWindow(message.lastReceivedAt)) return null;
  const template = WHATSAPP_NOTICE_TEMPLATES[message.automationKind];
  return message.templateParameters.length === templateParameterCount(template) ? template : null;
}

/**
 * Sends one WhatsApp message: an automated notice outside the 24-hour window as its approved
 * template (D32); else its text, or — with files — each file as media, the text as the first one's
 * caption (WC-11). Answers the first message's id (its reports follow the entry).
 */
async function sendWhatsApp(
  message: ClaimedContactMessage,
  phoneNumberId: string,
  media: readonly MetaMediaAttachment[],
): Promise<SentOutcome> {
  const template = noticeTemplateOf(message, media);
  if (template !== null) {
    const sent = await sendWhatsAppTemplateMessage({
      phoneNumberId,
      to: message.primaryPhone,
      template,
      parameters: message.templateParameters,
    });
    return {
      providerMessageId: sent.providerMessageId,
      templateBody: renderWhatsAppTemplate(template, message.templateParameters),
    };
  }
  if (media.length === 0) {
    const sent = await sendWhatsAppTextMessage({
      phoneNumberId,
      to: message.primaryPhone,
      body: message.body,
    });
    return { providerMessageId: sent.providerMessageId };
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
  return { providerMessageId: String(firstId) };
}

/** Sends one Instagram message: its text, then each file (Instagram has no captions — WC-11). */
async function sendInstagram(
  message: ClaimedContactMessage,
  accountId: string,
  media: readonly MetaMediaAttachment[],
): Promise<SentOutcome> {
  const recipientId = String(message.instagramRecipientId);
  const sent = await sendInstagramTextMessage({ accountId, recipientId, body: message.body });
  for (const attachment of media) {
    await sendInstagramAttachmentMessage({ accountId, recipientId, attachment });
  }
  return { providerMessageId: sent.providerMessageId };
}

/** Sends one message through the Graph API — the caller has ruled out every refusal. */
async function send(
  message: ClaimedContactMessage,
  organization: MessagingOrganization,
): Promise<SentOutcome> {
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

/** The automated notices one job settled — the `contact-message-delivery.completed` log (M4). */
interface NoticeCounts {
  noticeSentCount: number;
  noticeFailedCount: number;
}

/** Counts one settled message; an automated notice also on `automated_notices_total` (M4). */
function countOutcome(options: {
  message: ClaimedContactMessage;
  outcome: 'sent' | 'failed';
  counts: ContactMessageDeliveryCounts;
  notices: NoticeCounts;
}): void {
  const { message, outcome, counts, notices } = options;
  if (outcome === 'sent') counts.sentCount += 1;
  else counts.failedCount += 1;
  if (message.automationKind === null) return;
  recordAutomatedNotice({ kind: message.automationKind, outcome });
  if (outcome === 'sent') notices.noticeSentCount += 1;
  else notices.noticeFailedCount += 1;
}

/** Sends the claimed messages one by one, each outcome written right after (WC-1, WC-2). */
async function sendClaimedMessages(options: {
  organizationPublicId: string;
  organization: MessagingOrganization;
  messages: readonly ClaimedContactMessage[];
  counts: ContactMessageDeliveryCounts;
  notices: NoticeCounts;
}): Promise<void> {
  const { organizationPublicId, organization, messages, counts, notices } = options;
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
      countOutcome({ message, outcome: 'failed', counts, notices });
      continue;
    }
    try {
      const sent = await send(message, organization);
      await write((repository) =>
        repository.markSent({
          id: message.id,
          providerMessageId: sent.providerMessageId,
          ...(sent.templateBody === undefined ? {} : { body: sent.templateBody }),
        }),
      );
      countOutcome({ message, outcome: 'sent', counts, notices });
    } catch (error) {
      const graphError = findMetaGraphApiError(error);
      if (graphError?.isMessageRejection) {
        await write((repository) =>
          repository.markFailed({ id: message.id, reason: graphError.reason }),
        );
        countOutcome({ message, outcome: 'failed', counts, notices });
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
 * as WhatsApp text — as its template when templates are on (D32) — then is stamped — a number Meta refuses is skipped; a throttle or outage stops
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
    const parameters = dayCloseSummaryParameters(day);
    for (const phone of pending.phones) {
      try {
        // The admins' 24-hour window is not known: with templates on, always the template (D32)
        await (isWhatsAppTemplatesEnabled()
          ? sendWhatsAppTemplateMessage({
              phoneNumberId,
              to: phone,
              template: WHATSAPP_DAY_CLOSE_SUMMARY_TEMPLATE,
              parameters,
            })
          : sendWhatsAppTextMessage({ phoneNumberId, to: phone, body }));
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
 *   connected, not on WhatsApp, no Instagram conversation yet) or sent — an automated notice to
 *   someone silent for 24 hours as its approved template when templates are on (D32), the
 *   template's text then kept as the entry's body — and its outcome written
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
  const notices: NoticeCounts = { noticeSentCount: 0, noticeFailedCount: 0 };
  await sendClaimedMessages({ organizationPublicId, organization, messages, counts, notices });
  counts.summaryCount = await sendDayCloseSummaries({ organizationPublicId, organization });
  if (messages.length === CONTACT_MESSAGE_DELIVERY_BATCH) {
    await requestContactMessageDelivery(organizationPublicId);
  }
  if (messages.length > 0 || counts.summaryCount > 0) {
    logger.info(
      { organizationPublicId, ...counts, ...notices },
      'contact-message-delivery.completed',
    );
  }
  return counts;
}
