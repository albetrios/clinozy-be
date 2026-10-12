/** A contact message template as the API returns it (launch ROUTE #130 — routes-final 4.D.6). */
export interface ContactMessageTemplateOutput {
  /** `mtpl_…` */
  id: string;
  /** 1–60, unique in the organization in any case. */
  name: string;
  /** 1–1000; may hold `<first>` and `<interest>` (M9). */
  body: string;
  /** `whatsapp` (default) · `instagram`. */
  type: string;
  created_at: string;
  updated_at: string;
}
