import { describe, expect, it } from 'vitest';
import { expectedCashOf } from '@/domains/app/sub-domains/billing/day-closes/day-closes.rules.js';

/** The day's figures with only the cash that moved (the rest does not count toward the drawer). */
function figures(cash_in: number, cash_out: number) {
  return { cash_in, cash_out, net: { cash: 0, upi: 0, card: 0, credit: 0 }, entry_count: 0 };
}

/** B25: the expected cash in the drawer — the opening, plus the cash received, less the cash paid. */
describe('expectedCashOf (B25)', () => {
  it('adds the cash received to the opening and takes the cash paid away', () => {
    expect(expectedCashOf({ openingCash: 2000, figures: figures(1500, 300) })).toBe(3200);
  });

  it('is exact in paise', () => {
    expect(expectedCashOf({ openingCash: 0.1, figures: figures(0.2, 0) })).toBe(0.3);
    expect(expectedCashOf({ openingCash: 100.05, figures: figures(0.1, 0.15) })).toBe(100);
  });

  it('may go below zero when more cash left than came in (the count then says why)', () => {
    expect(expectedCashOf({ openingCash: 0, figures: figures(0, 50.5) })).toBe(-50.5);
  });
});
