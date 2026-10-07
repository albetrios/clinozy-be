/** A invoice as the API returns it (launch ROUTE #30). */
export interface InvoiceOutput {
  id: string;
  /** The organization-wide running number */
  invoice_sequence: number;
  /** The printed number `2026-27/0042` — per branch (its GSTIN) and financial year (D23), set on insert */
  invoice_number: string;
  /** April–March, e.g. 2026-27 — from the invoice date */
  financial_year: string;
  type: string;
  branch_id: string;
  patient_id: string | null;
  /** "Team" / "Prescribed by" */
  team_membership_ids: string[];
  items: unknown;
  overall_discount: number;
  invoice_date: string;
  remark: string | null;
  prescription_id: string | null;
  medical_contact_id: string | null;
  medical_sale_id: string | null;
  created_at: string;
  updated_at: string;
}
