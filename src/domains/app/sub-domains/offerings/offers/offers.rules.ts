import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { fieldValidationError, type ValidationError } from '@/shared/errors/index.js';
import { calendarDateInTimeZone, toText } from '@/shared/utils/validation/record-fields.util.js';
import {
  OFFER_EXTRA_SESSIONS_MAX,
  OFFER_KIND,
  OFFER_PERCENT_MAX,
  OFFER_STATUS,
  type OfferKind,
  type OfferStatus,
} from './offers.constants.js';

/** What an offer's derived status reads. */
interface OfferStatusInput {
  is_active: unknown;
  starts_on: unknown;
  ends_on: unknown;
}

/**
 * An offer's derived status on a calendar day (O10, schema-routes "state"): paused when switched
 * off, else scheduled before its start, ended after its end, live in between. Dates are
 * `YYYY-MM-DD`, so they compare as text; an empty start is "from now", an empty end is "no end".
 */
export function offerStatusOn(offer: OfferStatusInput, today: string): OfferStatus {
  if (offer.is_active !== true) return OFFER_STATUS.PAUSED;
  if (typeof offer.starts_on === 'string' && today < offer.starts_on) return OFFER_STATUS.SCHEDULED;
  if (typeof offer.ends_on === 'string' && today > offer.ends_on) return OFFER_STATUS.ENDED;
  return OFFER_STATUS.LIVE;
}

/** The 400 on one field of an offer, with its own message. */
function offerFieldError(field: 'value' | 'ends_on', messageKey: string): ValidationError {
  return fieldValidationError({ field, messageKey });
}

/** Whether `value` is a whole number from 1 to `max`. */
function isWholeBetweenOneAnd(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

/**
 * The offer's value fits its kind (O11) — `percent` a whole 1–100, `amount` / `fixed` rupees above
 * 0, `extra` whole sessions 1–99 — and it ends on or after it starts. Checked on a create's values
 * and on the row a `PATCH` would leave (a kind change re-checks the kept value).
 *
 * @remarks
 * - **Failure modes:** `ValidationError` (400) on `value` or `ends_on`.
 * - **Notes:** the database CHECKs (`chk_offers_value_for_kind`, `chk_offers_ends_after_starts`)
 *   hold the same rules.
 */
export function assertOfferValues(values: Record<string, unknown>): void {
  const kind = (values.kind ?? OFFER_KIND.PERCENT) as OfferKind;
  const value = Number(values.value);
  if (kind === OFFER_KIND.PERCENT && !isWholeBetweenOneAnd(value, OFFER_PERCENT_MAX)) {
    throw offerFieldError('value', 'errors:validation.offerPercentValue');
  }
  if (
    (kind === OFFER_KIND.AMOUNT || kind === OFFER_KIND.FIXED) &&
    (Number.isNaN(value) || value <= 0)
  ) {
    throw offerFieldError('value', 'errors:validation.offerAmountValue');
  }
  if (kind === OFFER_KIND.EXTRA && !isWholeBetweenOneAnd(value, OFFER_EXTRA_SESSIONS_MAX)) {
    throw offerFieldError('value', 'errors:validation.offerExtraValue');
  }
  if (
    values.ends_on != null &&
    values.starts_on != null &&
    toText(values.ends_on) < toText(values.starts_on)
  ) {
    throw offerFieldError('ends_on', 'errors:validation.offerEndsBeforeStarts');
  }
}

/** Stores an offer code uppercase — any case is accepted (O11). */
function upperCaseCode(values: Record<string, unknown>): void {
  if (typeof values.code === 'string') values.code = values.code.toUpperCase();
}

/**
 * The offers rules (launch ROUTE #128, routes-final 3.C): the code is stored uppercase (O11), and
 * every response carries the derived `status` on the organization's today (O10).
 *
 * @remarks
 * - **Algorithm:** `decorate` reads the organization's time zone once per response and derives
 *   each offer's status with {@link offerStatusOn}.
 * - **Notes:** a code another live offer has is the unique index's 409 (`offerCodeInUse`).
 */
export const offersRules: BaseRecordRules = {
  prepareCreate: (values) => upperCaseCode(values),
  prepareUpdate: (values) => upperCaseCode(values),
  decorate: async (outputs, context) => {
    const { timezone } = await context.ports.organizationSettings(context.scope);
    const today = calendarDateInTimeZone(timezone);
    for (const output of outputs) {
      output.status = offerStatusOn(output as unknown as OfferStatusInput, today);
    }
  },
};
