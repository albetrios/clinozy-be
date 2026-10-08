/**
 * A bought offering as the API returns it (launch ROUTE #135, routes-final 7.L.6).
 *
 * @remarks
 * - **Notes:** `sessions_left`, `is_package` (more than one session) and `status` (`active` ·
 *   `used_up` · `expired`, the organization's today) are derived (PK5); `invoice_item_id` is the
 *   invoice line that sold it and `invoice_id` that line's bill (PK4).
 */
export interface PatientOfferingOutput {
  id: string;
  patient_id: string;
  offering_id: string;
  offering_name: string;
  invoice_id: string | null;
  invoice_item_id: string | null;
  sessions_total: number;
  sessions_used: number;
  sessions_left: number;
  is_package: boolean;
  valid_until: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}
