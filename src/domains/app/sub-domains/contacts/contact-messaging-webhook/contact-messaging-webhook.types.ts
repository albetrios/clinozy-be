import type { MessagingWebhookChannel } from './contact-messaging-webhook.constants.js';

/** One update of a Meta callback, as stored: its channel, the account it came to, and itself. */
export interface MessagingWebhookUpdate {
  channel: MessagingWebhookChannel;
  /** The clinic's WhatsApp phone-number id, or Instagram account id. */
  accountId: string;
  /** The WhatsApp change `value`, or the Instagram `messaging` event, as Meta sent it. */
  payload: Record<string, unknown>;
}

/** A WhatsApp message the clinic received (a `messages[]` item of a change value). */
export interface WhatsAppInboundMessage {
  /** The sender's number, digits only (`919812300001`). */
  from?: string;
  /** Meta's `wamid`. */
  id?: string;
  /** Unix seconds, as text. */
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  /** The message this one answers. */
  context?: { id?: string };
}

/** A delivery report of a message the clinic sent (a `statuses[]` item of a change value). */
export interface WhatsAppStatusUpdate {
  /** The sent message's `wamid`. */
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}

/** A WhatsApp change `value` (`field: messages`). */
export interface WhatsAppChangeValue {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: WhatsAppInboundMessage[];
  statuses?: WhatsAppStatusUpdate[];
}

/** An Instagram `messaging` event: a message to the clinic, or a read receipt. */
export interface InstagramMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  /** Unix milliseconds. */
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; reply_to?: { mid?: string } };
  read?: { mid?: string };
}

/** What a processing job did (its return value). */
export interface MessagingWebhookRunCounts {
  processedCount: number;
  failedCount: number;
}
