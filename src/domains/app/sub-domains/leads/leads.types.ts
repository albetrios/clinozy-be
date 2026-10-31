/** The summary of its contact every lead carries, for lists (L1). */
export interface LeadContactOutput {
  id: string;
  contact_number: number;
  first_name: string;
  last_name: string | null;
  primary_phone: string;
  default_channel: string;
}

/**
 * A lead as the API returns it (launch ROUTE #131, routes-final 5.6): one enquiry and its working
 * state for a contact.
 *
 * @remarks
 * - **Notes:** the person lives on the contact — `contact` is its list summary, `last_activity_at`
 *   and `is_awaiting_reply` are the contact's (M3); `patient_id` is the patient file check-in
 *   opened (L8), read-only. `kind` and `retarget_reason` are server-set (L5).
 */
export interface LeadOutput {
  id: string;
  /** The "#2371" of the lead list — per organization, never reused */
  lead_number: number;
  contact_id: string;
  contact: LeadContactOutput | null;
  patient_id: string | null;
  status: string;
  source: string | null;
  interests: string[];
  kind: string;
  retarget_reason: string | null;
  /** Assigned */
  owner_membership_id: string | null;
  involved_membership_ids: string[];
  /** The owner's hold — open to the team after it (D40) */
  held_until: string | null;
  follow_up_at: string | null;
  /** When it last closed (D10) — null while open; read-only */
  closed_at: string | null;
  branch_id: string | null;
  notes: string | null;
  last_activity_at: string | null;
  is_awaiting_reply: boolean;
  created_at: string;
  updated_at: string;
}
