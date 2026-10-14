/** A brand a supplier distributes (11.B.6). */
export interface SupplierManufacturerOutput {
  id: string;
  name: string;
  tone: string;
}

/**
 * A supplier as the API returns it (launch ROUTE #153, routes-final 11.B.6).
 *
 * @remarks
 * - **Notes:** `payable` (rupees) is the received orders' dues less the open credits, never below
 *   0; `ageing_days` counts from the oldest received order still due (null when nothing is due);
 *   `order_count` the live orders and `order_total` their totals (MD10, MD30 (b)) — all the rules'
 *   `decorate`.
 */
export interface SupplierOutput {
  id: string;
  name: string;
  phone: string | null;
  gst_number: string | null;
  is_quick: boolean;
  manufacturers: SupplierManufacturerOutput[];
  payable: number;
  ageing_days: number | null;
  order_count: number;
  order_total: number;
  created_at: string;
  updated_at: string;
}
