import { RECORD_SMALL_COUNT_MAX } from '@/shared/constants/record-fields.constants.js';
/** The kinds of offer (O11): % off, ₹ off, a fixed price, or extra sessions. */
export const OFFER_KIND = {
  PERCENT: 'percent',
  AMOUNT: 'amount',
  FIXED: 'fixed',
  EXTRA: 'extra',
} as const;

/** Allowed values of `offers.kind`. */
export const OFFER_KIND_VALUES = [
  OFFER_KIND.PERCENT,
  OFFER_KIND.AMOUNT,
  OFFER_KIND.FIXED,
  OFFER_KIND.EXTRA,
] as const;

/** An offer's kind. */
export type OfferKind = (typeof OFFER_KIND_VALUES)[number];

/**
 * An offer's derived state (O10, schema-routes "state"): paused when switched off, else scheduled
 * before its start, ended after its end, live in between — never stored.
 */
export const OFFER_STATUS = {
  LIVE: 'live',
  SCHEDULED: 'scheduled',
  PAUSED: 'paused',
  ENDED: 'ended',
} as const;

/** The derived states in the list's default order — Live → Scheduled → Paused → Ended (O10). */
export const OFFER_STATUS_VALUES = [
  OFFER_STATUS.LIVE,
  OFFER_STATUS.SCHEDULED,
  OFFER_STATUS.PAUSED,
  OFFER_STATUS.ENDED,
] as const;

/** An offer's derived state. */
export type OfferStatus = (typeof OFFER_STATUS_VALUES)[number];

/** The largest `percent` value — 100% off (O11). */
export const OFFER_PERCENT_MAX = 100;

/** The most extra sessions an `extra` offer gives (O11). */
export const OFFER_EXTRA_SESSIONS_MAX = RECORD_SMALL_COUNT_MAX;

/** The longest offer code (O11). */
export const OFFER_CODE_MAX_LENGTH = 16;

/** Most offerings one offer applies to. */
export const OFFER_OFFERING_IDS_MAX = 50;

/** Most branches one offer runs at (none = every branch, O5). */
export const OFFER_BRANCH_IDS_MAX = 20;
