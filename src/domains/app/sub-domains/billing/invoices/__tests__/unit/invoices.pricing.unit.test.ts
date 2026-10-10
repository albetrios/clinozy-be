import { describe, expect, it } from 'vitest';
import {
  billedPriceOf,
  type InvoiceOfferCandidate,
} from '@/domains/app/sub-domains/billing/invoices/invoices.pricing.js';

/** A live offer of `kind` worth `value`, open-ended. */
function offer(
  id: string,
  kind: string,
  value: number,
  overrides: Partial<InvoiceOfferCandidate> = {},
): InvoiceOfferCandidate {
  return { id, kind, value, starts_on: null, ends_on: null, is_active: true, ...overrides };
}

const DAY = '2026-10-10';

/**
 * The billed price (M26, routes-final §3.10) — the screen's "Billed today" rule: the best live
 * price offer on the base, never below the lowest price; the most free sessions of a live
 * extra-sessions offer.
 */
describe('billedPriceOf', () => {
  it('bills the offer price, else the list price, with no offer', () => {
    expect(
      billedPriceOf({ price: 1500, offerPrice: 1200, minPrice: 0, offers: [], day: DAY }),
    ).toEqual({ rate: 1200, priceOfferId: null, extraSessions: 0, extraOfferId: null });
    expect(
      billedPriceOf({ price: 1500, offerPrice: null, minPrice: 0, offers: [], day: DAY }).rate,
    ).toBe(1500);
  });

  it('takes an offer price of 0, or one not below the list price, as no offer price', () => {
    expect(
      billedPriceOf({ price: 1500, offerPrice: 0, minPrice: 0, offers: [], day: DAY }).rate,
    ).toBe(1500);
    expect(
      billedPriceOf({ price: 1500, offerPrice: 1500, minPrice: 0, offers: [], day: DAY }).rate,
    ).toBe(1500);
  });

  it('rounds a percentage to the whole rupee, on the offer price', () => {
    const billed = billedPriceOf({
      price: 1500,
      offerPrice: 1350,
      minPrice: 0,
      offers: [offer('ofr_a', 'percent', 15)],
      day: DAY,
    });
    expect(billed).toMatchObject({ rate: 1148, priceOfferId: 'ofr_a' });
  });

  it('lets the lowest result win among percent, amount and fixed offers — they do not stack', () => {
    const offers = [
      offer('ofr_percent', 'percent', 10),
      offer('ofr_amount', 'amount', 250.5),
      offer('ofr_fixed', 'fixed', 800),
    ];
    expect(
      billedPriceOf({ price: 1000, offerPrice: null, minPrice: 0, offers, day: DAY }),
    ).toMatchObject({ rate: 749.5, priceOfferId: 'ofr_amount' });
  });

  it('never raises the base with a fixed price, nor goes below 0 with an amount off', () => {
    expect(
      billedPriceOf({
        price: 1000,
        offerPrice: null,
        minPrice: 0,
        offers: [offer('ofr_fixed', 'fixed', 1200)],
        day: DAY,
      }),
    ).toMatchObject({ rate: 1000, priceOfferId: null });
    expect(
      billedPriceOf({
        price: 100,
        offerPrice: null,
        minPrice: 0,
        offers: [offer('ofr_amount', 'amount', 500)],
        day: DAY,
      }),
    ).toMatchObject({ rate: 0, priceOfferId: 'ofr_amount' });
  });

  it('raises the result to the lowest price', () => {
    expect(
      billedPriceOf({
        price: 1000,
        offerPrice: null,
        minPrice: 800,
        offers: [offer('ofr_half', 'percent', 50)],
        day: DAY,
      }),
    ).toMatchObject({ rate: 800, priceOfferId: 'ofr_half' });
  });

  it('weighs only offers live on the day — not paused, scheduled or ended', () => {
    const offers = [
      offer('ofr_paused', 'percent', 50, { is_active: false }),
      offer('ofr_scheduled', 'percent', 40, { starts_on: '2026-10-11' }),
      offer('ofr_ended', 'percent', 30, { ends_on: '2026-10-09' }),
      offer('ofr_live', 'percent', 10, { starts_on: '2026-10-10', ends_on: '2026-10-10' }),
    ];
    expect(
      billedPriceOf({ price: 1000, offerPrice: null, minPrice: 0, offers, day: DAY }),
    ).toMatchObject({ rate: 900, priceOfferId: 'ofr_live' });
  });

  it('keeps the earlier candidate on a tie', () => {
    const offers = [offer('ofr_newer', 'fixed', 900), offer('ofr_older', 'amount', 100)];
    expect(
      billedPriceOf({ price: 1000, offerPrice: null, minPrice: 0, offers, day: DAY }).priceOfferId,
    ).toBe('ofr_newer');
  });

  it('adds the most free sessions of the live extra-sessions offers, beside a price offer', () => {
    const offers = [
      offer('ofr_one', 'extra', 1),
      offer('ofr_two', 'extra', 2),
      offer('ofr_off', 'percent', 20),
    ];
    expect(billedPriceOf({ price: 6000, offerPrice: null, minPrice: 0, offers, day: DAY })).toEqual(
      { rate: 4800, priceOfferId: 'ofr_off', extraSessions: 2, extraOfferId: 'ofr_two' },
    );
  });
});
