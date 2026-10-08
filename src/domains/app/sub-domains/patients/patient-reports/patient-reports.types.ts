/** A patient report as the API returns it (launch ROUTE #133, routes-final 7.G.6) — clinical (P29). */
export interface PatientReportOutput {
  id: string;
  patient_id: string;
  type: string;
  name: string;
  report_date: string;
  /** Confirmed uploads (PDF, JPG, PNG ≤ 10 MB) */
  file_keys: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}
