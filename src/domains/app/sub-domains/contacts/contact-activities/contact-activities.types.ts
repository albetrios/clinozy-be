import type { ContactActivityLinkColumn } from './contact-activities.constants.js';

/**
 * A contact activity entry as the API returns it (launch ROUTE #130 — routes-final 4.C.6): a
 * WhatsApp or Instagram message, a call log, a note or a server event in the contact's stream.
 *
 * @remarks
 * - **Notes:** at most one of the twelve record links is set (M5); `group` is derived from the
 *   type and the link (M10, D63); the delivery fields are the messaging worker's (M8).
 */
export type ContactActivityOutput = {
  /** `msg_…` */
  id: string;
  /** `con_…` */
  contact_id: string;
  type: string;
  direction: string | null;
  body: string;
  contact_message_template_id: string | null;
  attachment_keys: string[];
  reply_to_contact_activity_id: string | null;
  delivery_status: string | null;
  provider_message_id: string | null;
  failure_reason: string | null;
  occurred_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  /** `mem_…`; null for a received or system entry. */
  author_membership_id: string | null;
  /** `messages` · `clinical` · `money` · `tasks`. */
  group: string;
  created_at: string;
  updated_at: string;
} & Record<ContactActivityLinkColumn, string | null>;

/** One messaging channel in {@link ContactMessagingStatusOutput}. */
export interface ContactMessagingChannelStatus {
  /** The clinic's account on this channel is connected (organization settings). */
  is_connected: boolean;
  /** Messages waiting to go out on this channel. */
  queued_count: number;
}

/**
 * `GET /app/contact-activities/messaging-status` (launch D77, WC-2) — what the composer shows:
 * whether messages go out at all, whether Meta is down ("WhatsApp down · replies will queue"),
 * and each channel's connection and queue.
 */
export interface ContactMessagingStatusOutput {
  /** Delivery is on for this deployment — off, every message stays queued. */
  is_delivery_enabled: boolean;
  /** Meta is failing (the `meta` circuit is not closed) — messages queue until it is back. */
  is_provider_down: boolean;
  whatsapp: ContactMessagingChannelStatus;
  instagram: ContactMessagingChannelStatus;
}
