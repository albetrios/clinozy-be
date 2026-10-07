/** A feedback action as the API returns it (launch ROUTE #43). */
export interface FeedbackActionOutput {
  id: string;
  check_in_id: string | null;
  review_id: string | null;
  action: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}
