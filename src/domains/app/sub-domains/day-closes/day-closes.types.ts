/** A day close as the API returns it (launch ROUTE #38). */
export interface DayCloseOutput {
  id: string;
  branch_id: string;
  close_date: string;
  status: string;
  opening_cash: number;
  opening_source: string;
  opening_accepted_at: string;
  counted_cash: number | null;
  closed_at: string | null;
  difference_reason: string | null;
  reopened_at: string | null;
  is_auto_closed: boolean;
  created_at: string;
  updated_at: string;
}
