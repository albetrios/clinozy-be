/** A logged MR visit as the API returns it (launch ROUTE #153, routes-final 11.G.6). */
export interface MedicalRepVisitOutput {
  id: string;
  medical_rep_id: string;
  visit_date: string;
  next_visit_on: string | null;
  samples: string | null;
  notes: string | null;
  logged_by_membership_id: string | null;
  created_at: string;
}
