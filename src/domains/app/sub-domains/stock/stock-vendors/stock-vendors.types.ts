/**
 * A stock vendor as the API returns it (launch ROUTE #137, routes-final 9.E.6).
 *
 * @remarks
 * - **Notes:** `payable` is the open dues of its live purchases (S13), rupees; `purchase_count`
 *   how many live purchases it has, paid or not (D81).
 */
export interface StockVendorOutput {
  id: string;
  name: string;
  phone: string | null;
  is_quick: boolean;
  payable: number;
  purchase_count: number;
  created_at: string;
  updated_at: string;
}
