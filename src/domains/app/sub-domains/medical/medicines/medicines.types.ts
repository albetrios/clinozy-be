/** A medicine's manufacturer as a page shows it (11.D.6). */
export interface MedicineManufacturerOutput {
  id: string;
  name: string;
  tone: string;
}

/** One batch with stock (11.D.6) — `expiry_month` as `YYYY-MM`. */
export interface MedicineBatchOutput {
  id: string;
  batch_number: string;
  expiry_month: string;
  quantity: number;
  purchase_rate: number | null;
  supplier_id: string | null;
  is_expired: boolean;
}

/** What a supplier charges for the medicine (11.D.6). */
export interface MedicineSupplierPriceOutput {
  supplier_id: string;
  supplier_name: string;
  rate: number;
  free_quantity: number;
  lead_days: number;
}

/**
 * A medicine as the API returns it (launch ROUTE #153, routes-final 11.D.6).
 *
 * @remarks
 * - **Notes:** money in rupees, MRP with GST inside; `quantity` is its batches' sum (MD4);
 *   `stock_level`, `price_before_gst` and `needs_details` come from the row, the rest (batches,
 *   prices, nearest expiry, best rate, margin, manufacturer) from the rules' `decorate`.
 */
export interface MedicineOutput {
  id: string;
  medicine_number: number;
  name: string;
  composition: string | null;
  manufacturer: MedicineManufacturerOutput | null;
  is_prescription_only: boolean;
  mrp: number;
  gst_percent: number;
  price_before_gst: number;
  min_stock: number;
  max_stock: number;
  quantity: number;
  stock_level: string;
  nearest_expiry: { expiry_month: string; batch_number: string } | null;
  near_expiry_discount_percent: number | null;
  best_rate: { rate: number; supplier_id: string; supplier_name: string } | null;
  margin_percent: number | null;
  is_quick: boolean;
  needs_details: boolean;
  batches: MedicineBatchOutput[];
  supplier_prices: MedicineSupplierPriceOutput[];
  created_at: string;
  updated_at: string;
}
