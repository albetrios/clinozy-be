/**
 * A plan row as the API returns it (launch ROUTE #135, routes-final 7.M.6).
 *
 * @remarks
 * - **Notes:** `source_label` is derived from where it came from — "Check-in · 26 Sep", "Appt
 *   #2790 · Consultation", else "Patient file" (PK8); `is_below_lowest_price` = `price` below the
 *   offering's lowest price × quantity (PK9); `invoiced_quantity` / `is_fully_invoiced` read the
 *   live invoices' lines that name it (PK7).
 */
export interface PatientOfferingSuggestionOutput {
  id: string;
  patient_id: string;
  offering_id: string;
  offering_name: string;
  quantity: number;
  price: number | null;
  status: string;
  reason: string | null;
  appointment_id: string | null;
  patient_check_in_id: string | null;
  source_label: string;
  suggested_by_membership_id: string | null;
  invoiced_quantity: number;
  is_fully_invoiced: boolean;
  is_below_lowest_price: boolean;
  created_at: string;
  updated_at: string;
}
