/** One of a contact's numbers, as the Contact carries it (routes-final 4.A.6). */
export interface ContactPhoneOutput {
  /** `+91` and 10 digits. */
  phone: string;
  /** Exactly one per contact — `primary_phone` is its copy (CT2). */
  is_primary: boolean;
  is_on_whatsapp: boolean;
}

/**
 * A contact as the API returns it (launch ROUTE #129 — routes-final 4.A.6): one person, shared by
 * their leads, activity, patient file and appointments.
 *
 * @remarks
 * - **Notes:** `phones` is on single-contact responses only (routes 2–6); the list and the preview
 *   carry `primary_phone`. The patient, open-lead and visit fields are read-only: the open lead's
 *   from #131; the patient and visit fields null until #132 appointments, #133 patients (D61).
 */
export interface ContactOutput {
  id: string;
  /** Shown as "C-12345" — per organization, never reused. */
  contact_number: number;
  first_name: string;
  last_name: string | null;
  gender: string | null;
  /** `YYYY-MM-DD`; never in the future (CT13). */
  date_of_birth: string | null;
  /** The primary number (CT2). */
  primary_phone: string;
  phones?: ContactPhoneOutput[];
  email: string | null;
  /** "Area, city". */
  address: string | null;
  instagram_handles: string[];
  /** `whatsapp` · `call` · `instagram` — follows the last channel used (CT4). */
  default_channel: string;
  /** Lowercase snake_case keys (CT14). */
  preference_tags: string[];
  has_marketing_consent: boolean;
  referral_source: string | null;
  /** `con_…` — only for `referral_source = patient` (CT13). */
  referred_by_contact_id: string | null;
  referred_by_name: string | null;
  /** `con_…` — the household's first contact; itself when it is the first (CT3). */
  household_contact_id: string;
  /** `mem_…` — the team members who handle this person (CT11). */
  member_membership_ids: string[];
  patient_id: string | null;
  patient_number: number | null;
  open_lead_id: string | null;
  open_lead_status: string | null;
  last_visit_on: string | null;
  next_visit_on: string | null;
  last_activity_at: string | null;
  last_sent_at: string | null;
  last_received_at: string | null;
  /** A received entry newer than the team's last sent one. */
  is_awaiting_reply: boolean;
  created_at: string;
  updated_at: string;
}

/** An appointment as the contact preview shows it (route 7). */
export interface ContactPreviewAppointment {
  id: string;
  appointment_date: string;
  start_time: string;
  service_label: string;
  status: string;
}

/**
 * The hover card (route 7): the Contact (without `phones`) plus the open lead (#131), the patient
 * file and the next and last appointment — those null until their rows are built (D61).
 */
export interface ContactPreviewOutput extends ContactOutput {
  open_lead: { id: string; status: string; owner_membership_id: string | null } | null;
  patient: { id: string; patient_number: number } | null;
  next_appointment: ContactPreviewAppointment | null;
  last_appointment: ContactPreviewAppointment | null;
}
