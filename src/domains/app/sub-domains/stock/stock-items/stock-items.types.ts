/**
 * A stock item as the API returns it (launch ROUTE #137, routes-final 9.A.6).
 *
 * @remarks
 * - **Notes:** quantities are plain decimals (S4); `stock_level` is `out` at 0, `low` up to the
 *   minimum, else `ok`; `lasts_days` the whole days the stock lasts at the weekly usage (null
 *   without usage, S6).
 */
export interface StockItemOutput {
  id: string;
  /** The "#167" running number */
  stock_item_number: number;
  name: string;
  category: string;
  unit: string;
  size_per_unit: number | null;
  measure_unit: string | null;
  quantity: number;
  min_quantity: number;
  max_quantity: number;
  usage_per_week: number;
  stock_vendor_id: string | null;
  last_rate: number | null;
  stock_level: string;
  lasts_days: number | null;
  created_at: string;
  updated_at: string;
}
