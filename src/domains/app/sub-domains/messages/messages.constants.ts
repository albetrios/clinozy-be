/** Allowed values of `messages.channel`. */
export const MESSAGE_CHANNEL_VALUES = [
  'whatsapp',
  'call',
  'sms',
  'instagram',
  'email',
  'note',
] as const;

/** Allowed values of `messages.direction`. */
export const MESSAGE_DIRECTION_VALUES = ['sent', 'received'] as const;

/** Allowed values of `messages.kind`. */
export const MESSAGE_KIND_VALUES = [
  'text',
  'template',
  'media',
  'call_log',
  'note',
  'system',
] as const;

/** Allowed values of `messages.delivery_status`. */
export const MESSAGE_DELIVERY_STATUS_VALUES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
] as const;

/** Allowed values of `messages.record_type` — What the line points at. */
export const MESSAGE_RECORD_TYPE_VALUES = [
  'appointment',
  'invoice',
  'payment',
  'prescription',
  'patient_package',
  'review',
  'check_in',
  'task',
] as const;
