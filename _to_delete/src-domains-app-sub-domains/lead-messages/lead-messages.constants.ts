/** Allowed values of `lead_messages.channel`. */
export const LEAD_MESSAGE_CHANNEL_VALUES = [
  'whatsapp',
  'call',
  'sms',
  'instagram',
  'email',
  'note',
] as const;

/** Allowed values of `lead_messages.direction`. */
export const LEAD_MESSAGE_DIRECTION_VALUES = ['sent', 'received'] as const;

/** Allowed values of `lead_messages.delivery_status`. */
export const LEAD_MESSAGE_DELIVERY_STATUS_VALUES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
] as const;
