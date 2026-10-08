/** What happened to a day (routes-final 8.E.6 — B27). */
export interface DayCloseEventOutput {
  id: string;
  kind: string;
  text: string | null;
  membership_id: string | null;
  occurred_at: string;
}

/** The day's net money by split mode (received − paid). */
export interface DayCloseNetByModeOutput {
  cash: number;
  upi: number;
  card: number;
  credit: number;
}

/** One member's entries of the day (who recorded them). */
export interface DayCloseMemberTotalOutput {
  membership_id: string | null;
  count: number;
  amount: number;
}

/**
 * A branch's day as the API returns it (launch ROUTE #136, routes-final 8.E.6).
 *
 * @remarks
 * - **Notes:** the live figures — `cash_in`, `cash_out`, `net_by_mode`, `by_member`,
 *   `entry_count` — are the day's live payments; `expected_cash` is live while open and the
 *   stored figure once closed (B25); `events` what happened (B27).
 */
export interface DayCloseOutput {
  id: string;
  branch_id: string;
  close_date: string;
  status: string;
  opening_cash: number;
  opening_source: string;
  opening_accepted_at: string;
  opening_accepted_by_membership_id: string | null;
  cash_in: number;
  cash_out: number;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  difference_reason: string | null;
  close_kind: string | null;
  closed_at: string | null;
  closed_by_membership_id: string | null;
  net_by_mode: DayCloseNetByModeOutput;
  by_member: DayCloseMemberTotalOutput[];
  entry_count: number;
  events: DayCloseEventOutput[];
  created_at: string;
  updated_at: string;
}
