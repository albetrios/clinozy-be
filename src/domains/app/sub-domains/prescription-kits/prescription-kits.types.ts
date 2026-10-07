/** A prescription kit as the API returns it (launch ROUTE #26). */
export interface PrescriptionKitOutput {
  id: string;
  name: string;
  items: unknown;
  created_at: string;
  updated_at: string;
}
