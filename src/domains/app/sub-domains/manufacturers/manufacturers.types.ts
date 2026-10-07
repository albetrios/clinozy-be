/** A manufacturer as the API returns it (launch ROUTE #44). */
export interface ManufacturerOutput {
  id: string;
  name: string;
  tone: string;
  /** Created inline from a picker — needs completing */
  is_quick: boolean;
  created_at: string;
  updated_at: string;
}
