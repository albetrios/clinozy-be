/** A check-in as the API returns it (launch ROUTE #41). */
export interface CheckInOutput {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  treatment_id: string | null;
  context: string;
  feel: string;
  score: number;
  followed: string | null;
  followed_note: string | null;
  /** How it is now */
  current_state: string | null;
  next_plan: string | null;
  /** Each becomes a planned offering suggestion */
  next_offering_ids: string[];
  check_in_date: string;
  created_at: string;
  updated_at: string;
}
