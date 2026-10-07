/** A stock item as the API returns it (launch ROUTE #54). */
export interface StockItemOutput {
  id: string;
  /** The "#167" of the stock list */
  stock_item_number: number;
  name: string;
  category: string;
  unit: string;
  /** "1 tube = 30 g" ×1000 */
  size_per_unit_milli: number | null;
  measure_unit: string | null;
  /** Stock ×1000 — moved only by stock movements */
  quantity_milli: number;
  min_quantity: number;
  max_quantity: number;
  usage_per_week_milli: number;
  stock_vendor_id: string | null;
  last_rate: number | null;
  created_at: string;
  updated_at: string;
}
