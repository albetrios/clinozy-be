/** A patient as the API returns it (launch ROUTE #13). */
export interface PatientOutput {
  id: string;
  /** The "#3508" of the patient list — per organization, never reused */
  patient_number: number;
  first_name: string;
  last_name: string | null;
  phone: string;
  /** More mobiles (`+91…`) */
  phones: string[];
  email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  home_branch_id: string;
  types: string[];
  status: string;
  conversion: string;
  referral_source: string | null;
  referred_by_patient_id: string | null;
  referred_by_name: string | null;
  doctor_membership_id: string | null;
  follow_up_at: string | null;
  notes: string | null;
  lead_id: string | null;
  /** Data consent (D39: AI ideas only with it) */
  has_data_consent: boolean;
  has_photo_consent: boolean;
  has_marketing_consent: boolean;
  language: string | null;
  instagram_handles: string[];
  default_channel: string | null;
  preferences: unknown;
  household: string | null;
  allergies: string[];
  contraindications: string[];
  /** The date of the latest checked-in or completed appointment (YYYY-MM-DD) (per viewer, computed on read) */
  last_visit_on: string | null;
  /** The date of the next scheduled or confirmed appointment (YYYY-MM-DD) (per viewer, computed on read) */
  next_visit_on: string | null;
  created_at: string;
  updated_at: string;
}
