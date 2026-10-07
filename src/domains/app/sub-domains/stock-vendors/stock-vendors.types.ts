/** A stock vendor as the API returns it (launch ROUTE #53). */
export interface StockVendorOutput {
  id: string;
  name: string;
  phone: string | null;
  is_quick: boolean;
  created_at: string;
  updated_at: string;
}
