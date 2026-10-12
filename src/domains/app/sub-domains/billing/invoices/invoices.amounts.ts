import { paiseOf } from '@/shared/utils/validation/record-fields.util.js';
/** What a line contributes to the amounts (rupees; the rate is per unit). */
export interface InvoiceLinePricing {
  quantity: number;
  rate: number;
  discountPercent: number;
  gstPercent: number;
  isGstInclusive: boolean;
}

/** One line's computed amounts (rupees, to the paisa). */
export interface InvoiceLineAmounts {
  gross: number;
  /** The line's own discount plus its share of the overall discount. */
  discountAmount: number;
  /** What the line comes to after both discounts, before GST is added (B10's per-unit floor reads it). */
  net: number;
  taxableAmount: number;
  gstAmount: number;
  amount: number;
}

/** An invoice's computed amounts (rupees, to the paisa). */
export interface InvoiceAmounts {
  lines: InvoiceLineAmounts[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  gstTotal: number;
  total: number;
  /** What the lines come to after their own discounts — the overall discount's ceiling. */
  afterLineDiscounts: number;
}

/** Paise → rupees. */
function toRupees(paise: number): number {
  return paise / 100;
}

/** The last index whose value is above zero (−1 when none) — the line that absorbs the rounding. */
function lastIndexWithValue(values: readonly number[]): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if ((values[index] ?? 0) > 0) return index;
  }
  return -1;
}

/** The sum of a list of paise. */
function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Keeps every line's share of the overall discount within what the line has left. The absorbing
 * line takes the paise the other lines' rounding left over; when it is a small line and the
 * discount covers nearly the whole bill, that can be more than the line is worth (its net would go
 * below zero). The excess moves back to the lines before it, each up to what it has left. The
 * overall discount never passes what the lines come to, so the excess always fits.
 */
function spillShareExcess(options: {
  shares: number[];
  after: readonly number[];
  fromIndex: number;
}): void {
  const { shares, after } = options;
  let excess = (shares[options.fromIndex] ?? 0) - (after[options.fromIndex] ?? 0);
  if (excess <= 0) return;
  shares[options.fromIndex] = after[options.fromIndex] ?? 0;
  for (let index = options.fromIndex - 1; index >= 0 && excess > 0; index -= 1) {
    const room = (after[index] ?? 0) - (shares[index] ?? 0);
    const moved = Math.min(room, excess);
    shares[index] = (shares[index] ?? 0) + moved;
    excess -= moved;
  }
}

/**
 * Computes every line's and the invoice's amounts (routes-final 8.A, B9) — gross = quantity ×
 * rate; the line discount = gross × `discount_percent` ÷ 100; the overall discount shared across
 * the lines in proportion to what is left after their own discounts, the last line that has
 * something left absorbing the rounding (never past what it has left — any excess moves to the
 * lines before it); net = gross − both; taxable = net ÷ (1 + GST ÷ 100) when
 * the GST is inclusive, else net; GST = taxable × GST ÷ 100 (inclusive: net − taxable, so the line
 * comes to its price exactly); amount = taxable + GST.
 *
 * @remarks
 * - **Algorithm:** whole paise throughout, each line rounded to the paisa; the totals are the
 *   lines' sums, so `total = taxable_total + gst_total` holds exactly.
 * - **Failure modes:** none — the caller refuses an overall discount above `afterLineDiscounts`
 *   (400 `overall_discount`) before writing.
 */
export function computeInvoiceAmounts(options: {
  lines: readonly InvoiceLinePricing[];
  overallDiscount: number;
}): InvoiceAmounts {
  const gross = options.lines.map((line) => line.quantity * paiseOf(line.rate));
  const lineDiscounts = options.lines.map((line, index) =>
    Math.round(((gross[index] ?? 0) * paiseOf(line.discountPercent)) / 10_000),
  );
  const after = gross.map((value, index) => value - (lineDiscounts[index] ?? 0));
  const afterTotal = sum(after);
  const overall = Math.min(paiseOf(options.overallDiscount), afterTotal);
  const absorbingIndex = lastIndexWithValue(after);
  const shares = after.map((value, index) =>
    index === absorbingIndex || afterTotal === 0 ? 0 : Math.floor((overall * value) / afterTotal),
  );
  if (absorbingIndex >= 0) {
    shares[absorbingIndex] = overall - sum(shares);
    spillShareExcess({ shares, after, fromIndex: absorbingIndex });
  }
  const lines = options.lines.map((line, index): InvoiceLineAmounts => {
    const net = (after[index] ?? 0) - (shares[index] ?? 0);
    const taxable = line.isGstInclusive ? Math.round((net * 100) / (100 + line.gstPercent)) : net;
    // An inclusive price is what the line comes to: its GST is the rest, never a rounded extra paisa
    const gst = line.isGstInclusive ? net - taxable : Math.round((taxable * line.gstPercent) / 100);
    return {
      gross: toRupees(gross[index] ?? 0),
      discountAmount: toRupees((lineDiscounts[index] ?? 0) + (shares[index] ?? 0)),
      net: toRupees(net),
      taxableAmount: toRupees(taxable),
      gstAmount: toRupees(gst),
      amount: toRupees(taxable + gst),
    };
  });
  const totalOf = (pick: (line: InvoiceLineAmounts) => number) =>
    toRupees(sum(lines.map((line) => paiseOf(pick(line)))));
  return {
    lines,
    subtotal: toRupees(sum(gross)),
    discountTotal: totalOf((line) => line.discountAmount),
    taxableTotal: totalOf((line) => line.taxableAmount),
    gstTotal: totalOf((line) => line.gstAmount),
    total: totalOf((line) => line.amount),
    afterLineDiscounts: toRupees(afterTotal),
  };
}
