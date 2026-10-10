import {
  OFFER_KIND,
  OFFER_STATUS,
} from '@/domains/app/sub-domains/offerings/offers/offers.constants.js';
import { offerStatusOn } from '@/domains/app/sub-domains/offerings/offers/offers.rules.js';

/** An offer that names an offering and runs at the invoice's branch — live or not (the rule decides). */
export interface InvoiceOfferCandidate {
  /** The offer's public id. */
  id: string;
  kind: string;
  /** `percent` 1–100 · `amount` / `fixed` rupees · `extra` whole sessions (O11). */
  value: number;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
}

/** What an offering bills on a day at a branch (routes-final §3.10, M26). */
export interface InvoiceBilledPrice {
  /** The line's rate (rupees) — the best price offer on the base, never below the lowest price. */
  rate: number;
  /** The price offer that won, or null. */
  priceOfferId: string | null;
  /** The free sessions the best extra-sessions offer adds per unit; 0 when none. */
  extraSessions: number;
  /** The extra-sessions offer that won, or null. */
  extraOfferId: string | null;
}

/** Rupees → paise (exact for 2-decimal amounts). */
function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * A price offer applied to a base (rupees): a percentage rounds to the whole rupee (₹1,350 at 15%
 * off is ₹1,148 — the screen's "Billed today"), an amount off never goes below 0, a fixed price
 * never raises the base; an extra-sessions offer leaves the price.
 */
function priceAfter(base: number, offer: InvoiceOfferCandidate): number {
  switch (offer.kind) {
    case OFFER_KIND.PERCENT:
      return Math.round(base * (1 - offer.value / 100));
    case OFFER_KIND.AMOUNT:
      return Math.max(0, toPaise(base) - toPaise(offer.value)) / 100;
    case OFFER_KIND.FIXED:
      return offer.value > 0 ? Math.min(base, offer.value) : base;
    default:
      return base;
  }
}

/**
 * The price an offering bills on a day at a branch — "billing applies the same rule" as the
 * offerings list's "Billed today" (routes-final §3.10, M26).
 *
 * @remarks
 * - **Algorithm:** the base is the offer price when one is set above 0 and below the list price,
 *   else the list price. Of the candidates live on `day` ({@link offerStatusOn} — the offers list's
 *   own status rule), price offers don't stack: the lowest result wins (a tie keeps the earlier
 *   candidate); extra-sessions offers don't stack either — the most sessions win — but combine
 *   with a price offer. The rate is then raised to the lowest price (`min_price`, 0 = none).
 * - **Failure modes:** none — pure.
 * - **Notes:** the caller passes only offers that name the offering and run at the invoice's
 *   branch (none = every branch, O5), newest first — the offers list's order inside "live".
 */
export function billedPriceOf(options: {
  price: number;
  offerPrice: number | null;
  minPrice: number;
  offers: readonly InvoiceOfferCandidate[];
  day: string;
}): InvoiceBilledPrice {
  const { price, offerPrice, minPrice } = options;
  const base = offerPrice !== null && offerPrice > 0 && offerPrice < price ? offerPrice : price;
  let rate = base;
  let priceOfferId: string | null = null;
  let extraSessions = 0;
  let extraOfferId: string | null = null;
  for (const offer of options.offers) {
    if (offerStatusOn(offer, options.day) !== OFFER_STATUS.LIVE) continue;
    if (offer.kind === OFFER_KIND.EXTRA) {
      if (offer.value > extraSessions) {
        extraSessions = offer.value;
        extraOfferId = offer.id;
      }
      continue;
    }
    const after = priceAfter(base, offer);
    if (toPaise(after) < toPaise(rate)) {
      rate = after;
      priceOfferId = offer.id;
    }
  }
  if (minPrice > 0 && toPaise(rate) < toPaise(minPrice)) rate = minPrice;
  return { rate, priceOfferId, extraSessions, extraOfferId };
}
