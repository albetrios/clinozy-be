import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  computeInvoiceAmounts,
  type InvoiceLinePricing,
} from '@/domains/app/sub-domains/billing/invoices/invoices.amounts.js';
import { propertyAssertOptions } from '@/tests/helpers/fast-check-property.util.js';

const propertyOptions = propertyAssertOptions();

/** Rupees → whole paise, as the amounts are stored (`numeric(12,2)`). */
const paise = (rupees: number) => Math.round(rupees * 100);

/** An amount in rupees to the paisa, up to `maxRupees`. */
const rupeesUpTo = (maxRupees: number) =>
  fc.integer({ min: 0, max: maxRupees * 100 }).map((value) => value / 100);

/** One line as the invoice form sends it: India's GST slabs, either side of the price. */
const lineArbitrary: fc.Arbitrary<InvoiceLinePricing> = fc.record({
  quantity: fc.integer({ min: 1, max: 20 }),
  rate: rupeesUpTo(50_000),
  discountPercent: fc.integer({ min: 0, max: 10_000 }).map((value) => value / 100),
  gstPercent: fc.constantFrom(0, 5, 12, 18, 28),
  isGstInclusive: fc.boolean(),
});

/** A bill: one to eight lines and an overall discount up to what they come to (and beyond). */
const billArbitrary = fc.array(lineArbitrary, { minLength: 1, maxLength: 8 }).chain((lines) =>
  fc.record({
    lines: fc.constant(lines),
    overallDiscount: rupeesUpTo(
      Math.ceil(lines.reduce((total, line) => total + line.quantity * line.rate, 0)) + 100,
    ),
  }),
);

/**
 * Layer 2 (property) for the invoice amounts (routes-final 8.A, B9; D20 the overall discount before
 * tax, D21 GST inside or on top): the example suites pin a handful of bills; these pin the
 * arithmetic for any bill — the totals add up to the paisa, nothing goes negative, the overall
 * discount is shared exactly, an inclusive price is what the line comes to, and more discount never
 * costs more.
 */
describe('computeInvoiceAmounts (property)', () => {
  it('adds up to the paisa: every line and the totals', () => {
    fc.assert(
      fc.property(billArbitrary, ({ lines, overallDiscount }) => {
        const amounts = computeInvoiceAmounts({ lines, overallDiscount });
        for (const line of amounts.lines) {
          expect(paise(line.amount)).toBe(paise(line.taxableAmount) + paise(line.gstAmount));
          expect(paise(line.net)).toBe(paise(line.gross) - paise(line.discountAmount));
        }
        const sumOf = (pick: (line: (typeof amounts.lines)[number]) => number) =>
          amounts.lines.reduce((total, line) => total + paise(pick(line)), 0);
        expect(paise(amounts.subtotal)).toBe(sumOf((line) => line.gross));
        expect(paise(amounts.discountTotal)).toBe(sumOf((line) => line.discountAmount));
        expect(paise(amounts.taxableTotal)).toBe(sumOf((line) => line.taxableAmount));
        expect(paise(amounts.gstTotal)).toBe(sumOf((line) => line.gstAmount));
        expect(paise(amounts.total)).toBe(paise(amounts.taxableTotal) + paise(amounts.gstTotal));
      }),
      propertyOptions,
    );
  });

  it('never goes negative, and a line never loses more than it is worth', () => {
    fc.assert(
      fc.property(billArbitrary, ({ lines, overallDiscount }) => {
        const amounts = computeInvoiceAmounts({ lines, overallDiscount });
        for (const line of amounts.lines) {
          expect(line.net).toBeGreaterThanOrEqual(0);
          expect(line.taxableAmount).toBeGreaterThanOrEqual(0);
          expect(line.gstAmount).toBeGreaterThanOrEqual(0);
          expect(paise(line.discountAmount)).toBeLessThanOrEqual(paise(line.gross));
        }
        expect(amounts.total).toBeGreaterThanOrEqual(0);
      }),
      propertyOptions,
    );
  });

  it('shares the overall discount exactly, capped at what the lines come to (D20)', () => {
    fc.assert(
      fc.property(billArbitrary, ({ lines, overallDiscount }) => {
        const amounts = computeInvoiceAmounts({ lines, overallDiscount });
        const lineDiscounts = lines.reduce(
          (total, line) =>
            total +
            Math.round((line.quantity * paise(line.rate) * paise(line.discountPercent)) / 10_000),
          0,
        );
        const applied = Math.min(paise(overallDiscount), paise(amounts.afterLineDiscounts));
        expect(paise(amounts.discountTotal)).toBe(lineDiscounts + applied);
        expect(paise(amounts.afterLineDiscounts)).toBe(paise(amounts.subtotal) - lineDiscounts);
      }),
      propertyOptions,
    );
  });

  it('charges GST on the discounted value: inside the price it is what the line comes to, on top it is the slab (D21)', () => {
    fc.assert(
      fc.property(billArbitrary, ({ lines, overallDiscount }) => {
        const amounts = computeInvoiceAmounts({ lines, overallDiscount });
        lines.forEach((pricing, index) => {
          const line = amounts.lines[index];
          if (!line) throw new Error('a line is missing');
          if (pricing.isGstInclusive) {
            // The customer pays the price: GST is worked out of it, never a paisa on top
            expect(paise(line.amount)).toBe(paise(line.net));
            // The taxable value is the price without its GST, to the paisa
            expect(
              Math.abs(
                paise(line.taxableAmount) * (100 + pricing.gstPercent) - paise(line.net) * 100,
              ),
            ).toBeLessThanOrEqual((100 + pricing.gstPercent) / 2);
          } else {
            expect(paise(line.taxableAmount)).toBe(paise(line.net));
            expect(
              Math.abs(
                paise(line.gstAmount) * 100 - paise(line.taxableAmount) * pricing.gstPercent,
              ),
            ).toBeLessThanOrEqual(50);
          }
        });
      }),
      propertyOptions,
    );
  });

  it('never costs more with a bigger overall discount', () => {
    fc.assert(
      fc.property(billArbitrary, rupeesUpTo(5_000), ({ lines, overallDiscount }, extra) => {
        const smaller = computeInvoiceAmounts({ lines, overallDiscount });
        const bigger = computeInvoiceAmounts({ lines, overallDiscount: overallDiscount + extra });
        expect(paise(bigger.total)).toBeLessThanOrEqual(paise(smaller.total));
      }),
      propertyOptions,
    );
  });

  it('does not depend on the order of the lines for its totals before tax', () => {
    fc.assert(
      fc.property(fc.array(lineArbitrary, { minLength: 1, maxLength: 8 }), (lines) => {
        // With no overall discount nothing is shared, so each line stands alone
        const forward = computeInvoiceAmounts({ lines, overallDiscount: 0 });
        const backward = computeInvoiceAmounts({ lines: [...lines].reverse(), overallDiscount: 0 });
        expect(backward.subtotal).toBe(forward.subtotal);
        expect(backward.total).toBe(forward.total);
        expect(backward.gstTotal).toBe(forward.gstTotal);
      }),
      propertyOptions,
    );
  });
});
