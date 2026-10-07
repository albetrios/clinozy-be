/** A medicine as the API returns it (launch ROUTE #48). */
export interface MedicineOutput {
  id: string;
  /** The "#458" of the medicine list */
  medicine_number: number;
  name: string;
  composition: string | null;
  manufacturer_id: string;
  mrp: number;
  gst_percent: number;
  min_stock: number;
  max_stock: number;
  batches: unknown;
  supplier_rates: unknown;
  /** Quick-created (a doctor typing a new name) — needs MRP and composition */
  is_quick: boolean;
  is_prescription_only: boolean;
  near_expiry_discount_percent: number;
  created_at: string;
  updated_at: string;
}
