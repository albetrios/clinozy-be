/** A medical rep visit as the API returns it (launch ROUTE #47). */
export interface MedicalRepVisitOutput {
  id: string;
  medical_rep_id: string;
  visit_date: string;
  samples: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
