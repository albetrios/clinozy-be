/**
 * A medical representative as the API returns it (launch ROUTE #153, routes-final 11.F.6).
 *
 * @remarks
 * - **Notes:** `last_visit_on` and `last_samples` are the latest live visit's, `is_visit_overdue`
 *   the next visit before today (MD17); with the manufacturers they are the rules' `decorate`.
 */
export interface MedicalRepOutput {
  id: string;
  name: string;
  phone: string | null;
  next_visit_on: string | null;
  is_visit_overdue: boolean;
  last_visit_on: string | null;
  last_samples: string | null;
  manufacturers: { id: string; name: string; tone: string }[];
  created_at: string;
  updated_at: string;
}
