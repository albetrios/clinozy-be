import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  ProviderOutageError,
  toProviderOutageError,
} from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import {
  sendInstagramTextMessage,
  sendWhatsAppTextMessage,
} from '@/infrastructure/messaging/meta-graph.client.js';
import { findMetaGraphApiError } from '@/infrastructure/messaging/meta-graph-error.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  type ClaimedContactMessage,
  createWorkerContactMessageDeliveryRepository,
  type MessagingOrganization,
} from '@/domains/app/sub-domains/contacts/contact-activities/contact-message-delivery.repository.js';
import { requestContactMessageDelivery } from '@/domains/app/sub-domains/contacts/contact-activities/queues/contact-message-delivery.queue.js';
import {
  CONTACT_MESSAGE_DELIVERY_BATCH,
  CONTACT_MESSAGE_FAILURE_INSTAGRAM_NOT_CONNECTED,
  CONTACT_MESSAGE_FAILURE_NO_INSTAGRAM_CONVERSATION,
  CONTACT_MESSAGE_FAILURE_NOT_ON_WHATSAPP,
  CONTACT_MESSAGE_FAILURE_WHATSAPP_NOT_CONNECTED,
} from './contact-message-delivery.constants.js';

/**
 * What one delivery job did (its return value, logged as `contact-message-delivery.completed`).
 *
 * @remarks
 * - **Notes:** `sentCount` — messages Meta took; `failedCount` — messages refused (by Meta, or
 *   before any call: no account connected, not on WhatsApp, no Instagram conversation yet).
 */
export interface ContactMessageDeliveryCounts {
  sentCount: number;
  failedCount: number;
}

/** A message's fate before any call: why it cannot go out, or `null` when it can. */
function refusalOf(
  message: ClaimedContactMessage,
  organization: MessagingOrganization,
): string | null {
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

/** Sends one message through the Graph API — the caller has ruled out every refusal. */
async function send(
  message: ClaimedContactMessage,
  organization: MessagingOrganization,
): Promise<string> {
  const sent =
    message.type === 'whatsapp'
      ? await sendWhatsAppTextMessage({
          phoneNumberId: String(organization.whatsappPhoneNumberId),
          to: message.primaryPhone,
          body: message.body,
        })
      : await sendInstagramTextMessage({
          accountId: String(organization.instagramAccountId),
          recipientId: String(message.instagramRecipientId),
          body: message.body,
        });
  return sent.providerMessageId;
}

/**
 * One organization's message delivery (launch D77, WC-1, WC-2): claims its oldest queued WhatsApp
 * and Instagram messages and sends each through the platform Meta app.
 *
 * @remarks
 * - **Algorithm:** a short organization context reads the clinic's accounts and claims a batch
 *   (`delivery_claimed_at`); the context closes; each message is then refused (no number
 *   connected, not on WhatsApp, no Instagram conversation yet) or sent, and its outcome written
 *   in its own short context right after — `sent` with Meta's id, or `failed` with the reason for
 *   a refusal Meta or the setup gave. A full batch asks for the next job.
 * - **Failure modes:** a throttle or an outage of Meta (the `meta` circuit opening) releases every
 *   claim still held — those messages stay `queued`, never dropped — and throws a
 *   {@link ProviderOutageError} so the queue pauses (`createProviderPausableWorker`); any other
 *   error releases the claims and propagates (BullMQ retries).
 * - **Side effects:** Graph API sends; `contact_activities` updates; possibly a follow-up job.
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
  const counts: ContactMessageDeliveryCounts = { sentCount: 0, failedCount: 0 };
  if (!claimed || claimed.messages.length === 0) return counts;
  const { organization, messages } = claimed;
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
      if (graphError?.isRateLimited) {
        throw new ProviderOutageError({
          provider: 'meta',
          cause: error,
          retryAfterMs: graphError.retryAfterMs,
        });
      }
      throw (await toProviderOutageError({ error, provider: 'meta' })) ?? error;
    }
  }
  if (messages.length === CONTACT_MESSAGE_DELIVERY_BATCH) {
    await requestContactMessageDelivery(organizationPublicId);
  }
  logger.info({ organizationPublicId, ...counts }, 'contact-message-delivery.completed');
  return counts;
}
