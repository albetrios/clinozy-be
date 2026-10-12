/** An offering group as the API returns it (launch ROUTE #10, rebuilt at #128 — routes-final 3.A.6). */
export interface OfferingGroupOutput {
  id: string;
  name: string;
  /** 0–9999 — the menu order (O8). */
  sort_order: number;
  created_at: string;
  updated_at: string;
}
