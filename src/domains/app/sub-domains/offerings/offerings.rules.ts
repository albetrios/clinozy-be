import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { fieldValidationError, type ValidationError } from '@/shared/errors/index.js';
import type { OFFERING_CATEGORY_VALUES } from './offerings.constants.js';

/** The GST a consultation starts with — consultations are exempt (offerings rule). */
const CONSULTATION_GST_PERCENT = 0;
/** The GST every other offering (a procedure, package or product) starts with. */
const PROCEDURE_GST_PERCENT = 18;
/** The category that is a consultation. */
const CONSULTATION: (typeof OFFERING_CATEGORY_VALUES)[number] = 'consultation';

/** The 400 naming the price field that breaks `min_price` ≤ `offer_price` ≤ `price` (O4). */
function priceOrderError(field: 'offer_price' | 'min_price', messageKey: string): ValidationError {
  return fieldValidationError({ field, messageKey });
}

/**
 * O4: an offering's prices keep `min_price` ≤ `offer_price` ≤ `price` — an empty offer price is the
 * list price, an empty lowest price is 0. Checked on a create's values and on the row a `PATCH`
 * would leave.
 *
 * @remarks
 * - **Failure modes:** `ValidationError` (400) on `offer_price` when it is above the price, else on
 *   `min_price` when it is above the offer price (or the price, without one).
 * - **Notes:** the database CHECKs (`chk_offerings_*_within_*`) hold the same order.
 */
export function assertOfferingPriceOrder(values: Record<string, unknown>): void {
  const price = Number(values.price);
  const offerPrice = values.offer_price == null ? null : Number(values.offer_price);
  const minPrice = values.min_price == null ? 0 : Number(values.min_price);
  if (offerPrice !== null && offerPrice > price) {
    throw priceOrderError('offer_price', 'errors:validation.offeringOfferPriceAbovePrice');
  }
  if (offerPrice !== null && minPrice > offerPrice) {
    throw priceOrderError('min_price', 'errors:validation.offeringMinPriceAboveOfferPrice');
  }
  if (offerPrice === null && minPrice > price) {
    throw priceOrderError('min_price', 'errors:validation.offeringMinPriceAbovePrice');
  }
}

/**
 * The offerings rules (launch ROUTE #63, rebuilt at #128 — routes-final 3.B): a new offering
 * without a GST rate gets its category's — 0% for a consultation, 18% otherwise; changing the
 * category later leaves it.
 *
 * @remarks
 * - **Notes:** prices need no code of their own — `offering:create` sets them and `offering:update`
 *   changes them (O3); the lowest price is hidden without `offering:lower_price:read` in the
 *   controller (O15).
 */
export const offeringsRules: BaseRecordRules = {
  prepareCreate: (values) => {
    if (values.gst_percent === undefined) {
      values.gst_percent =
        (values.category ?? 'treatment') === CONSULTATION
          ? CONSULTATION_GST_PERCENT
          : PROCEDURE_GST_PERCENT;
    }
  },
};
