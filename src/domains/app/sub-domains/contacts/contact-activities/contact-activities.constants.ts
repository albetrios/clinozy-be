/** An entry's type (M2): two message channels, a call log, an internal note, a server event. */
export const CONTACT_ACTIVITY_TYPE = {
  WHATSAPP: 'whatsapp',
  INSTAGRAM: 'instagram',
  CALL_LOG: 'call_log',
  NOTE: 'note',
  SYSTEM: 'system',
} as const;

/** Allowed values of `contact_activities.type`. */
export const CONTACT_ACTIVITY_TYPE_VALUES = [
  CONTACT_ACTIVITY_TYPE.WHATSAPP,
  CONTACT_ACTIVITY_TYPE.INSTAGRAM,
  CONTACT_ACTIVITY_TYPE.CALL_LOG,
  CONTACT_ACTIVITY_TYPE.NOTE,
  CONTACT_ACTIVITY_TYPE.SYSTEM,
] as const;

/** The types that go out to the person — a send, a batch and a template (M9, M12). */
export const CONTACT_ACTIVITY_MESSAGE_TYPE_VALUES = [
  CONTACT_ACTIVITY_TYPE.WHATSAPP,
  CONTACT_ACTIVITY_TYPE.INSTAGRAM,
] as const;

/** Which way a message or call went (M2) — none on a note or a system entry. */
export const CONTACT_ACTIVITY_DIRECTION = {
  SENT: 'sent',
  RECEIVED: 'received',
} as const;

/** Allowed values of `contact_activities.direction`. */
export const CONTACT_ACTIVITY_DIRECTION_VALUES = [
  CONTACT_ACTIVITY_DIRECTION.SENT,
  CONTACT_ACTIVITY_DIRECTION.RECEIVED,
] as const;

/** Where a sent WhatsApp or Instagram message stands — written by the messaging worker (M8). */
export const CONTACT_ACTIVITY_DELIVERY_STATUS = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
} as const;

/** Allowed values of `contact_activities.delivery_status`. */
export const CONTACT_ACTIVITY_DELIVERY_STATUS_VALUES = [
  CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED,
  CONTACT_ACTIVITY_DELIVERY_STATUS.SENT,
  CONTACT_ACTIVITY_DELIVERY_STATUS.DELIVERED,
  CONTACT_ACTIVITY_DELIVERY_STATUS.READ,
  CONTACT_ACTIVITY_DELIVERY_STATUS.FAILED,
] as const;

/**
 * What a message Clinozy queues is for (launch D78) — the booking's confirm request and reminder,
 * a receipt, and TK10's payment reminder and review request; `null` on everything a person writes.
 */
export const CONTACT_ACTIVITY_AUTOMATION_KIND = {
  BOOKING_CONFIRM: 'booking_confirm',
  BOOKING_REMINDER: 'booking_reminder',
  PAYMENT_RECEIPT: 'payment_receipt',
  PAYMENT_REMINDER: 'payment_reminder',
  FEEDBACK_REQUEST: 'feedback_request',
} as const;

/** Allowed values of `contact_activities.automation_kind`. */
export const CONTACT_ACTIVITY_AUTOMATION_KIND_VALUES = [
  CONTACT_ACTIVITY_AUTOMATION_KIND.BOOKING_CONFIRM,
  CONTACT_ACTIVITY_AUTOMATION_KIND.BOOKING_REMINDER,
  CONTACT_ACTIVITY_AUTOMATION_KIND.PAYMENT_RECEIPT,
  CONTACT_ACTIVITY_AUTOMATION_KIND.PAYMENT_REMINDER,
  CONTACT_ACTIVITY_AUTOMATION_KIND.FEEDBACK_REQUEST,
] as const;

/** A Clinozy message kind. */
export type ContactActivityAutomationKind =
  (typeof CONTACT_ACTIVITY_AUTOMATION_KIND_VALUES)[number];

/** The booking messages (WC-5, WC-6) — the ones a move, a cancel or a delete stops (WC-7). */
export const CONTACT_ACTIVITY_BOOKING_AUTOMATION_KINDS = [
  CONTACT_ACTIVITY_AUTOMATION_KIND.BOOKING_CONFIRM,
  CONTACT_ACTIVITY_AUTOMATION_KIND.BOOKING_REMINDER,
] as const;

/** The failure reason of a booking message stopped before it went (WC-7) — no `failed_message` task. */
export const CONTACT_ACTIVITY_REMINDER_STOPPED_REASON = 'reminder_stopped';

/** The stream's groups (M10): conversation, clinical, money and task entries. */
export const CONTACT_ACTIVITY_GROUP = {
  MESSAGES: 'messages',
  CLINICAL: 'clinical',
  MONEY: 'money',
  TASKS: 'tasks',
} as const;

/** Allowed values of the `group` filter and field. */
export const CONTACT_ACTIVITY_GROUP_VALUES = [
  CONTACT_ACTIVITY_GROUP.MESSAGES,
  CONTACT_ACTIVITY_GROUP.CLINICAL,
  CONTACT_ACTIVITY_GROUP.MONEY,
  CONTACT_ACTIVITY_GROUP.TASKS,
] as const;

/** A record link column of an entry (M5). */
export type ContactActivityLinkColumn = (typeof CONTACT_ACTIVITY_LINK_COLUMNS)[number];

/** The twelve record links (M5), at most one per entry — in the route review's order. */
export const CONTACT_ACTIVITY_LINK_COLUMNS = [
  'appointment_id',
  'invoice_id',
  'payment_id',
  'patient_prescription_id',
  'patient_offering_id',
  'patient_review_id',
  'patient_check_in_id',
  'task_id',
  'patient_treatment_id',
  'patient_clinical_note_id',
  'patient_image_id',
  'patient_report_id',
] as const;

/** The longest entry body (schema-routes; M6). */
export const CONTACT_ACTIVITY_BODY_MAX = 1000;
/** Most attachments on one entry. */
export const CONTACT_ACTIVITY_ATTACHMENTS_MAX = 5;
/** Most contacts one message batch reaches (route 16). */
export const CONTACT_ACTIVITY_BATCH_CONTACTS_MAX = 200;

/** The placeholders a message body may hold, filled for each contact (M9). */
export const CONTACT_ACTIVITY_PLACEHOLDER = {
  FIRST_NAME: '<first>',
  INTEREST: '<interest>',
} as const;

/** The links a system entry's group follows (D63) — the rest of the twelve are `clinical`. */
export const CONTACT_ACTIVITY_MONEY_LINKS: readonly ContactActivityLinkColumn[] = [
  'invoice_id',
  'payment_id',
  'patient_offering_id',
];
/** The link that makes a system entry a `tasks` one. */
export const CONTACT_ACTIVITY_TASK_LINK: ContactActivityLinkColumn = 'task_id';
/** The links that make a system entry `clinical`. */
export const CONTACT_ACTIVITY_CLINICAL_LINKS: readonly ContactActivityLinkColumn[] = [
  'appointment_id',
  'patient_prescription_id',
  'patient_review_id',
  'patient_check_in_id',
  'patient_treatment_id',
  'patient_clinical_note_id',
  'patient_image_id',
  'patient_report_id',
];

/**
 * An entry's group (M10, D63) from its row — the serializer's twin of the list's `group` filter.
 */
export function contactActivityGroupOf(row: Record<string, unknown>): string {
  if (row.type !== CONTACT_ACTIVITY_TYPE.SYSTEM) return CONTACT_ACTIVITY_GROUP.MESSAGES;
  const has = (columns: readonly ContactActivityLinkColumn[]) =>
    columns.some((column) => row[column] !== null && row[column] !== undefined);
  if (has(CONTACT_ACTIVITY_CLINICAL_LINKS)) return CONTACT_ACTIVITY_GROUP.CLINICAL;
  if (has(CONTACT_ACTIVITY_MONEY_LINKS)) return CONTACT_ACTIVITY_GROUP.MONEY;
  if (has([CONTACT_ACTIVITY_TASK_LINK])) return CONTACT_ACTIVITY_GROUP.TASKS;
  return CONTACT_ACTIVITY_GROUP.MESSAGES;
}
