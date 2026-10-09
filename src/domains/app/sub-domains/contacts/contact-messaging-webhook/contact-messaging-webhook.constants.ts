/** The channel a messaging callback came on — the two message types of the stream (launch D77). */
export const MESSAGING_WEBHOOK_CHANNEL = {
  WHATSAPP: 'whatsapp',
  INSTAGRAM: 'instagram',
} as const;

/** Allowed values of `messaging_webhook_events.channel`. */
export const MESSAGING_WEBHOOK_CHANNEL_VALUES = [
  MESSAGING_WEBHOOK_CHANNEL.WHATSAPP,
  MESSAGING_WEBHOOK_CHANNEL.INSTAGRAM,
] as const;

/** A messaging channel. */
export type MessagingWebhookChannel = (typeof MESSAGING_WEBHOOK_CHANNEL_VALUES)[number];

/** Where a stored callback stands — `pending` until the worker applies it (launch D77). */
export const MESSAGING_WEBHOOK_EVENT_STATUS = {
  PENDING: 'pending',
  PROCESSED: 'processed',
  FAILED: 'failed',
} as const;

/** Allowed values of `messaging_webhook_events.status`. */
export const MESSAGING_WEBHOOK_EVENT_STATUS_VALUES = [
  MESSAGING_WEBHOOK_EVENT_STATUS.PENDING,
  MESSAGING_WEBHOOK_EVENT_STATUS.PROCESSED,
  MESSAGING_WEBHOOK_EVENT_STATUS.FAILED,
] as const;

/** The `object` Meta names on a WhatsApp Business callback. */
export const META_WHATSAPP_OBJECT = 'whatsapp_business_account';
/** The `object` Meta names on an Instagram messaging callback. */
export const META_INSTAGRAM_OBJECT = 'instagram';

/** Tries before a stored callback that keeps failing is marked `failed` (and kept for an operator). */
export const MESSAGING_WEBHOOK_EVENT_MAX_ATTEMPTS = 5;
/** Stored callbacks one processing job applies. */
export const MESSAGING_WEBHOOK_EVENTS_PER_JOB = 50;
/** A claim older than this is a crashed job's — the event is claimable again. */
export const MESSAGING_WEBHOOK_EVENT_CLAIM_STALE_MINUTES = 5;
/** Days a processed or failed callback is kept before the purge removes it. */
export const MESSAGING_WEBHOOK_EVENT_RETENTION_DAYS = 30;
/** The longest callback body the webhook takes (Meta batches up to 1,000 updates). */
export const MESSAGING_WEBHOOK_BODY_LIMIT_BYTES = 3 * 1024 * 1024;
