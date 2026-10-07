/** A offering as the API returns it (launch ROUTE #11). */
export interface OfferingOutput {
  id: string;
  /** The "#274" of the offering list — per organization, never reused */
  offering_number: number;
  name: string;
  category: string;
  specialty: string;
  tone: string;
  price: number;
  min_price: number;
  duration_minutes: number;
  sessions: number;
  /** Packages: days a package stays usable; 0 = no expiry */
  validity_days: number;
  default_doctor_membership_id: string | null;
  default_room_id: string | null;
  gst_percent: number;
  is_active: boolean;
  group_id: string | null;
  offer_price: number | null;
  branch_ids: string[];
  is_gst_inclusive: boolean;
  search_terms: string[];
  description: string | null;
  created_at: string;
  updated_at: string;
}
