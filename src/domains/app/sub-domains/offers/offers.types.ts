/** A offer as the API returns it (launch ROUTE #12). */
export interface OfferOutput {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  /** percent: 1–100; amount and fixed: rupees; extra: sessions */
  value: number;
  offering_ids: string[];
  branch_ids: string[];
  /** Empty = from now on */
  starts_on: string | null;
  /** Empty = no end */
  ends_on: string | null;
  is_paused: boolean;
  tone: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}
