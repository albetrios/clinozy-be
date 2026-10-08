/** An offering as the API returns it (launch ROUTE #11, rebuilt at #128 — routes-final 3.B.6). */
export interface OfferingOutput {
  id: string;
  /** The "#274" of the offering list — per organization, never reused */
  offering_number: number;
  name: string;
  category: string;
  specialty: string;
  tone: string;
  /** The list price, rupees. */
  price: number;
  /** The lowest the desk may bill; `null` without `offering:lower_price:read` (O15). */
  min_price: number | null;
  duration_minutes: number;
  sessions: number;
  /** Packages: days a package stays usable; 0 = no expiry */
  validity_days: number;
  gst_percent: number;
  /** `false` = not offered now (O13). */
  is_active: boolean;
  /** `ogr_…` — the menu section (O1). */
  offering_group_id: string | null;
  /** What is billed; `null` = the list price (O4). */
  offer_price: number | null;
  /** `brn_…`; empty = every branch (O5). */
  branch_ids: string[];
  is_gst_inclusive: boolean;
  /** Aliases `q` also searches (O9). */
  search_terms: string[];
  description: string | null;
  created_at: string;
  updated_at: string;
}
