import type { OfferStatus } from './offers.constants.js';

/** An offer as the API returns it (launch ROUTE #12, rebuilt at #128 — routes-final 3.C.6). */
export interface OfferOutput {
  id: string;
  name: string;
  /** Uppercase A–Z and 0–9, unique among live offers (O11). */
  code: string | null;
  kind: string;
  /** percent: whole 1–100; amount and fixed: rupees; extra: whole sessions 1–99 (O11). */
  value: number;
  /** `off_…` — active offerings (O12). */
  offering_ids: string[];
  /** `brn_…`; empty = every branch (O5). */
  branch_ids: string[];
  /** Empty = from now on. */
  starts_on: string | null;
  /** Empty = no end. */
  ends_on: string | null;
  /** `false` = paused (O10). */
  is_active: boolean;
  /** Derived on the organization's today: live · scheduled · paused · ended (O10). */
  status: OfferStatus;
  tone: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}
