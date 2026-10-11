import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { toProviderOutageError } from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import { fetchInstagramUsername } from '@/infrastructure/messaging/meta-graph.client.js';
import { findMetaGraphApiError } from '@/infrastructure/messaging/meta-graph-error.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  type ContactMessagingInboundRepository,
  createWorkerContactMessagingInboundRepository,
  type InboundDeliveryStatus,
} from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-inbound.repository.js';
import {
  type ClaimedMessagingWebhookEvent,
  createWorkerContactMessagingWebhookRepository,
} from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.repository.js';
import {
  MESSAGING_WEBHOOK_CHANNEL,
  MESSAGING_WEBHOOK_EVENTS_PER_JOB,
} from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.constants.js';
import type {
  InstagramMessagingEvent,
  MessagingWebhookRunCounts,
  WhatsAppChangeValue,
  WhatsAppInboundMessage,
} from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.types.js';
import {
  isConfirmationReply,
  isStartReply,
  isStopReply,
} from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.replies.js';
import { requestMessagingWebhookEventProcessing } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/queues/messaging-webhook-event.queue.js';
import { requestTaskRulesRun } from '@/domains/app/sub-domains/tasks/queues/task-rules.queue.js';

/** The WhatsApp report statuses the stream knows (`deleted`, `warning` … are not messages' states). */
const DELIVERY_STATUSES: ReadonlySet<string> = new Set(['sent', 'delivered', 'read', 'failed']);

/** Unix seconds as text (WhatsApp) → a date; now when missing or malformed. */
function dateFromSeconds(seconds: string | undefined): Date {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(value * 1_000) : new Date();
}

/** Unix milliseconds (Instagram) → a date; now when missing. */
function dateFromMilliseconds(milliseconds: number | undefined): Date {
  return typeof milliseconds === 'number' && milliseconds > 0 ? new Date(milliseconds) : new Date();
}

/** A received message's text — its body, or what it carries when it is not text (`(image)`). */
function inboundBody({
  text,
  kind,
}: {
  text: string | undefined;
  kind: string | undefined;
}): string {
  const trimmed = text?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : `(${kind ?? 'message'})`;
}

/** Applies a WhatsApp change: its delivery reports, then the messages people sent. */
async function applyWhatsAppValue({
  inbound,
  organizationId,
  value,
}: {
  inbound: ContactMessagingInboundRepository;
  organizationId: number;
  value: WhatsAppChangeValue;
}): Promise<void> {
  for (const report of value.statuses ?? []) {
    if (typeof report.id !== 'string' || !DELIVERY_STATUSES.has(String(report.status))) continue;
    const firstError = report.errors?.[0];
    await inbound.advanceDeliveryStatus({
      organizationId,
      providerMessageId: report.id,
      status: report.status as InboundDeliveryStatus,
      at: dateFromSeconds(report.timestamp),
      ...(firstError ? { failureReason: firstError.message ?? firstError.title ?? '' } : {}),
    });
  }
  const profileNames = new Map(
    (value.contacts ?? []).flatMap((contact) =>
      contact.wa_id ? [[contact.wa_id, contact.profile?.name?.trim() ?? ''] as const] : [],
    ),
  );
  for (const message of value.messages ?? []) {
    await applyWhatsAppMessage({ inbound, organizationId, message, profileNames });
  }
}

/**
 * One WhatsApp message to the clinic: matched by number, or a new contact with a lead (WC-3); a
 * "yes" confirms the person's next booking that was asked (WC-8, D78); STOP stops the automated
 * messages to them and START lets them start again (D32, Meta's opt-out policy).
 */
async function applyWhatsAppMessage({
  inbound,
  organizationId,
  message,
  profileNames,
}: {
  inbound: ContactMessagingInboundRepository;
  organizationId: number;
  message: WhatsAppInboundMessage;
  profileNames: ReadonlyMap<string, string>;
}): Promise<void> {
  if (typeof message.id !== 'string' || typeof message.from !== 'string') return;
  const phone = `+${message.from.replace(/\D/g, '')}`;
  const profileName = profileNames.get(message.from);
  const contactId =
    (await inbound.findContactIdByPhone({ organizationId, phone })) ??
    (await inbound.createContactWithLead({
      organizationId,
      phone,
      firstName: profileName !== undefined && profileName.length > 0 ? profileName : phone,
    }));
  const body = inboundBody({ text: message.text?.body, kind: message.type });
  const isNew = await inbound.insertReceivedMessage({
    organizationId,
    contactId,
    type: MESSAGING_WEBHOOK_CHANNEL.WHATSAPP,
    body,
    providerMessageId: message.id,
    occurredAt: dateFromSeconds(message.timestamp),
    ...(message.context?.id ? { replyToProviderMessageId: message.context.id } : {}),
  });
  const text = message.text?.body;
  if (!isNew || text === undefined) return;
  if (isStopReply(text) || isStartReply(text)) {
    await inbound.setNoticesStopped({ organizationId, contactId, isStopped: isStopReply(text) });
  } else if (isConfirmationReply(text)) {
    await inbound.confirmBookingByReply({ organizationId, contactId });
  }
}

/** Applies an Instagram event: a read receipt, or a message to the clinic from a known person. */
async function applyInstagramEvent({
  inbound,
  organizationId,
  event,
  usernames,
}: {
  inbound: ContactMessagingInboundRepository;
  organizationId: number;
  event: InstagramMessagingEvent;
  usernames: ReadonlyMap<string, string | null>;
}): Promise<void> {
  const at = dateFromMilliseconds(event.timestamp);
  if (event.read?.mid) {
    await inbound.advanceDeliveryStatus({
      organizationId,
      providerMessageId: event.read.mid,
      status: 'read',
      at,
    });
    return;
  }
  const message = event.message;
  const senderId = event.sender?.id;
  if (!message?.mid || message.is_echo || !senderId) return;
  const username = usernames.get(senderId) ?? null;
  const contactId =
    (await inbound.findContactIdByInstagramSender({ organizationId, senderId })) ??
    (username === null
      ? null
      : await inbound.findContactIdByInstagramUsername({ organizationId, username }));
  if (contactId === null) {
    // A contact needs a phone number: an Instagram stranger is not one yet (D77).
    logger.info({ organizationId }, 'messaging-webhook.instagram_sender_unknown');
    return;
  }
  await inbound.insertReceivedMessage({
    organizationId,
    contactId,
    type: MESSAGING_WEBHOOK_CHANNEL.INSTAGRAM,
    body: inboundBody({ text: message.text, kind: 'attachment' }),
    providerMessageId: message.mid,
    providerSenderId: senderId,
    occurredAt: at,
    ...(message.reply_to?.mid ? { replyToProviderMessageId: message.reply_to.mid } : {}),
  });
}

/** The Instagram senders of the batch no contact has written as yet — they need a name lookup. */
async function unknownInstagramSenders({
  inbound,
  organizationId,
  events,
}: {
  inbound: ContactMessagingInboundRepository;
  organizationId: number;
  events: readonly ClaimedMessagingWebhookEvent[];
}): Promise<string[]> {
  const unknown = new Set<string>();
  for (const event of events) {
    if (event.channel !== MESSAGING_WEBHOOK_CHANNEL.INSTAGRAM) continue;
    const payload = event.payload as InstagramMessagingEvent;
    const senderId = payload.sender?.id;
    if (!payload.message?.mid || payload.message.is_echo || !senderId || unknown.has(senderId)) {
      continue;
    }
    if ((await inbound.findContactIdByInstagramSender({ organizationId, senderId })) === null) {
      unknown.add(senderId);
    }
  }
  return [...unknown];
}

/**
 * Applies one organization's stored messaging callbacks (launch D77, WC-1 statuses, WC-3 replies).
 *
 * @remarks
 * - **Algorithm:** a short organization context claims the oldest pending updates and lists the
 *   Instagram senders no contact wrote as yet; the context closes; each such sender's username is
 *   looked up on the Graph API (matched to a contact's Instagram handles); then each update is
 *   applied in its own transaction — delivery reports move messages forward only, replies become
 *   received entries, an unknown WhatsApp number a new contact with a lead — and marked
 *   `processed`. A full batch asks for the next job.
 * - **Failure modes:** an update that fails is counted (`failed` after five tries, else pending
 *   again) and the rest go on. Meta down or throttling during a lookup releases the claims and
 *   throws the outage (the queue pauses); a lookup Meta refuses leaves the sender unknown.
 * - **Side effects:** `contact_activities`, `contacts`, `contact_phones`, `leads` writes; Graph
 *   API lookups; a task-rules run once an update was applied (D81 T7); possibly a follow-up job.
 */
export async function runMessagingWebhookEventJob(
  organizationPublicId: string,
): Promise<MessagingWebhookRunCounts> {
  const counts: MessagingWebhookRunCounts = { processedCount: 0, failedCount: 0 };
  const claimed = await runOrganizationScopedWorkerJob({
    job: { organizationPublicId },
    processor: async (handle) => {
      const inbound = createWorkerContactMessagingInboundRepository(handle);
      const organizationId = await inbound.findOrganizationId(organizationPublicId);
      if (organizationId === null) return null;
      const events = await createWorkerContactMessagingWebhookRepository(handle).claimBatch({
        organizationId,
        limit: MESSAGING_WEBHOOK_EVENTS_PER_JOB,
      });
      return {
        organizationId,
        events,
        unknownSenders: await unknownInstagramSenders({ inbound, organizationId, events }),
      };
    },
  });
  if (!claimed || claimed.events.length === 0) return counts;
  const { organizationId, events } = claimed;

  const usernames = new Map<string, string | null>();
  for (const senderId of claimed.unknownSenders) {
    try {
      usernames.set(senderId, await fetchInstagramUsername(senderId));
    } catch (error) {
      if (findMetaGraphApiError(error)?.isMessageRejection) {
        usernames.set(senderId, null);
        continue;
      }
      await runOrganizationScopedWorkerJob({
        job: { organizationPublicId },
        processor: (handle) =>
          createWorkerContactMessagingWebhookRepository(handle).releaseClaims(
            events.map((event) => event.id),
          ),
      });
      throw (await toProviderOutageError({ error, provider: 'meta' })) ?? error;
    }
  }

  for (const event of events) {
    try {
      await runOrganizationScopedWorkerJob({
        job: { organizationPublicId },
        processor: async (handle) => {
          const inbound = createWorkerContactMessagingInboundRepository(handle);
          if (event.channel === MESSAGING_WEBHOOK_CHANNEL.WHATSAPP) {
            await applyWhatsAppValue({
              inbound,
              organizationId,
              value: event.payload as WhatsAppChangeValue,
            });
          } else {
            await applyInstagramEvent({
              inbound,
              organizationId,
              event: event.payload as InstagramMessagingEvent,
              usernames,
            });
          }
          await createWorkerContactMessagingWebhookRepository(handle).markProcessed(event.id);
        },
      });
      counts.processedCount += 1;
    } catch (error) {
      logger.warn(
        { error, organizationPublicId, eventId: event.id },
        'messaging-webhook-event.apply_failed',
      );
      await runOrganizationScopedWorkerJob({
        job: { organizationPublicId },
        processor: (handle) =>
          createWorkerContactMessagingWebhookRepository(handle).recordFailure({
            id: event.id,
            reason: error instanceof Error ? error.message : 'The update could not be applied',
          }),
      });
      counts.failedCount += 1;
    }
  }
  if (counts.processedCount > 0) {
    // A reply or a "yes" can close a task at once rather than at the next sweep (D81 T7, WC-48).
    await requestTaskRulesRun(organizationPublicId);
  }
  if (events.length === MESSAGING_WEBHOOK_EVENTS_PER_JOB) {
    await requestMessagingWebhookEventProcessing(organizationPublicId);
  }
  logger.info({ organizationPublicId, ...counts }, 'messaging-webhook-event.completed');
  return counts;
}
