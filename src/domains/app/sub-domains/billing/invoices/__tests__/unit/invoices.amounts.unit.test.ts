import { describe, expect, it } from 'vitest';
import {
  computeInvoiceAmounts,
  type InvoiceLinePricing,
} from '@/domains/app/sub-domains/billing/invoices/invoices.amounts.js';

/** A line at a rate, with defaults for the rest. */
function line(overrides: Partial<InvoiceLinePricing> & { rate: number }): InvoiceLinePricing {
  return { quantity: 1, discountPercent: 0, gstPercent: 18, isGstInclusive: false, ...overrides };
}

/**
 * The five worked invoices the clinic's accountant checks (D20, D21 — the review in
 * `docs/reviews/gst-worked-examples-2026-10-09.md`). Each figure here is the one printed there: a
 * change to the arithmetic fails this suite before it reaches a bill.
 */
describe('computeInvoiceAmounts — worked examples', () => {
  it('1. GST on top: ₹1,000 at 18% comes to ₹1,180', () => {
    const amounts = computeInvoiceAmounts({ lines: [line({ rate: 1000 })], overallDiscount: 0 });
    expect([amounts.taxableTotal, amounts.gstTotal, amounts.total]).toEqual([1000, 180, 1180]);
  });

  it('2. GST inside the price: a ₹6,000 package at 18% is ₹5,084.75 + ₹915.25', () => {
    const amounts = computeInvoiceAmounts({
      lines: [line({ rate: 6000, isGstInclusive: true })],
      overallDiscount: 0,
    });
    expect([amounts.taxableTotal, amounts.gstTotal, amounts.total]).toEqual([
      5084.75, 915.25, 6000,
    ]);
  });

  it('3. A line discount comes off before GST: ₹1,000 less 10% is ₹900 + ₹162', () => {
    const amounts = computeInvoiceAmounts({
      lines: [line({ rate: 1000, discountPercent: 10 })],
      overallDiscount: 0,
    });
    expect([amounts.discountTotal, amounts.taxableTotal, amounts.gstTotal, amounts.total]).toEqual([
      100, 900, 162, 1062,
    ]);
  });

  it('4. An overall discount is shared across the lines by value, before GST (D20)', () => {
    const amounts = computeInvoiceAmounts({
      lines: [
        line({ rate: 2500 }),
        line({ rate: 750, quantity: 2 }),
        line({ rate: 500, gstPercent: 0 }),
      ],
      overallDiscount: 450,
    });
    expect(
      amounts.lines.map((each) => [each.discountAmount, each.taxableAmount, each.gstAmount]),
    ).toEqual([
      [250, 2250, 405],
      [150, 1350, 243],
      [50, 450, 0],
    ]);
    expect([amounts.taxableTotal, amounts.gstTotal, amounts.total]).toEqual([4050, 648, 4698]);
  });

  it('5. Medicines at MRP (GST inside) next to a service (GST on top), with both discounts', () => {
    const amounts = computeInvoiceAmounts({
      lines: [
        line({ rate: 236.5, quantity: 2, gstPercent: 12, isGstInclusive: true }),
        line({ rate: 89, gstPercent: 5, isGstInclusive: true }),
        line({ rate: 1200, discountPercent: 5 }),
      ],
      overallDiscount: 100,
    });
    expect(
      amounts.lines.map((each) => [
        each.discountAmount,
        each.taxableAmount,
        each.gstAmount,
        each.amount,
      ]),
    ).toEqual([
      [27.79, 397.51, 47.7, 445.21],
      [5.22, 79.79, 3.99, 83.78],
      [126.99, 1073.01, 193.14, 1266.15],
    ]);
    expect([
      amounts.subtotal,
      amounts.discountTotal,
      amounts.taxableTotal,
      amounts.gstTotal,
      amounts.total,
    ]).toEqual([1762, 160, 1550.31, 244.83, 1795.14]);
  });

  it('never takes a small last line below zero when the discount covers nearly the whole bill', () => {
    // Found by the property suite: the last line took the other lines' rounding and went to −₹0.01
    const amounts = computeInvoiceAmounts({
      lines: [
        line({
          quantity: 15,
          rate: 10256.27,
          discountPercent: 0.04,
          gstPercent: 0,
          isGstInclusive: true,
        }),
        line({ quantity: 4, rate: 5926.44, discountPercent: 37.27, gstPercent: 28 }),
        line({ quantity: 10, rate: 33142.15, discountPercent: 0.05, isGstInclusive: true }),
        line({ quantity: 5, rate: 15713.99, discountPercent: 99.23, gstPercent: 5 }),
        line({ quantity: 18, rate: 19352.12, discountPercent: 29.92, gstPercent: 28 }),
        line({ quantity: 2, rate: 0.05, discountPercent: 32.8 }),
      ],
      overallDiscount: 690245.54,
    });
    for (const each of amounts.lines) {
      expect(each.net).toBeGreaterThanOrEqual(0);
      expect(each.taxableAmount).toBeGreaterThanOrEqual(0);
    }
    expect(Math.round(amounts.discountTotal * 100)).toBeLessThanOrEqual(
      Math.round(amounts.subtotal * 100),
    );
  });
});
