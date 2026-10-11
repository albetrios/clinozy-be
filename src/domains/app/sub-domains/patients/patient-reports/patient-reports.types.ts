/**
 * One of a report's files (D86): its key, the name it was uploaded under and a link that shows it,
 * valid 15 minutes and made fresh on every read — the name and link null when its upload is gone.
 */
export interface PatientReportFileOutput {
  file_key: string;
  file_name: string | null;
  file_url: string | null;
}

/** A patient report as the API returns it (launch ROUTE #133, routes-final 7.G.6) — clinical (P29). */
export interface PatientReportOutput {
  id: string;
  patient_id: string;
  type: string;
  name: string;
  report_date: string;
  /** Confirmed uploads (PDF, JPG, PNG ≤ 10 MB) */
  file_keys: string[];
  /** Each file in `file_keys` order, with its name and a view link (D86) */
  files: PatientReportFileOutput[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}
