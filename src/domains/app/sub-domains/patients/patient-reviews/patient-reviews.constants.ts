/** Allowed values of `patient_reviews.source`. */
export const PATIENT_REVIEW_SOURCE_VALUES = [
  'google',
  'video',
  'instagram',
  'internal_form',
  'whatsapp',
] as const;

/** A rating at or below this needs action (TR11 — the design's call-back). */
export const PATIENT_REVIEW_ACTION_RATING_MAX = 3;

/** Most files on one review. */
export const PATIENT_REVIEW_FILE_KEYS_MAX = 10;

/** The longest review text. */
export const PATIENT_REVIEW_TEXT_MAX = 2000;
