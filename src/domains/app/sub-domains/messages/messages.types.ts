/** A message as the API returns it (launch ROUTE #15). */
export interface MessageOutput {
  id: string;
  /** The contact, when a lead */
  lead_id: string | null;
  /** The contact, when a patient */
  patient_id: string | null;
  /** The contact, when a walk-in buyer */
  medical_contact_id: string | null;
  channel: string;
  direction: string;
  kind: string;
  body: string;
  /** The template the line was written from */
  message_template_id: string | null;
  /** Uploaded files sent with the line */
  attachment_keys: string[];
  /** The line this one answers */
  reply_to_message_id: string | null;
  delivery_status: string;
  /** The provider's id (WhatsApp wamid) — matches delivery reports */
  provider_message_id: string | null;
  failure_reason: string | null;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  /** Written by the app itself (a reminder, a receipt) */
  is_system: boolean;
  author_membership_id: string | null;
  /** What the line points at */
  record_type: string | null;
  /** That record's public id */
  record_id: string | null;
  /** The task the line answers */
  task_id: string | null;
  created_at: string;
  updated_at: string;
}
