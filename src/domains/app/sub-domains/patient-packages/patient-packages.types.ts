/** A patient package as the API returns it (launch ROUTE #31). */
export interface PatientPackageOutput {
  id: string;
  patient_id: string;
  offering_id: string;
  invoice_id: string | null;
  sessions_total: number;
  sessions_used: number;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}
