/** A medical contact as the API returns it (launch ROUTE #50). */
export interface MedicalContactOutput {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
}
