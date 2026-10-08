/**
 * A feedback action as the API returns it — inside its check-in or review (launch ROUTE #134,
 * routes-final 7.K.6); append-only (TR12).
 */
export interface PatientFeedbackActionOutput {
  id: string;
  action: string;
  note: string | null;
  /** The caller who logged it (the design's "by") */
  author_membership_id: string | null;
  created_at: string;
}
