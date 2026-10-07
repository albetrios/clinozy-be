/** A medical rep as the API returns it (launch ROUTE #46). */
export interface MedicalRepOutput {
  id: string;
  name: string;
  phone: string | null;
  manufacturer_ids: string[];
  next_visit_on: string | null;
  created_at: string;
  updated_at: string;
}
