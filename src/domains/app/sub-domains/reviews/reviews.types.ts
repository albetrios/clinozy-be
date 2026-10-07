/** A review as the API returns it (launch ROUTE #42). */
export interface ReviewOutput {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  source: string;
  rating: number | null;
  text: string | null;
  link: string | null;
  /** Video or screenshot uploads */
  file_keys: string[];
  review_date: string;
  created_at: string;
  updated_at: string;
}
