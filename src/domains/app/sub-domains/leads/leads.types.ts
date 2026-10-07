/** A lead as the API returns it (launch ROUTE #14). */
export interface LeadOutput {
  id: string;
  /** The "#2371" of the lead list — per organization, never reused */
  lead_number: number;
  name: string;
  phone: string;
  email: string | null;
  /** null only on a contact thread */
  status: string | null;
  source: string | null;
  interests: string[];
  /** Assigned */
  owner_membership_id: string | null;
  involved_membership_ids: string[];
  follow_up_at: string | null;
  branch_id: string | null;
  patient_id: string | null;
  /** A hidden thread an appointment opened for a non-lead — never in a lead list */
  is_contact_thread: boolean;
  kind: string;
  retarget_reason: string | null;
  notes: string | null;
  last_touch_at: string | null;
  phones: string[];
  instagram_handles: string[];
  default_channel: string | null;
  preferences: unknown;
  household: string | null;
  /** The owner's hold — open to the team after it (D40) */
  held_until: string | null;
  /** The conversation has lines the caller has not read (per viewer, computed on read) */
  is_unread: boolean;
  created_at: string;
  updated_at: string;
}
