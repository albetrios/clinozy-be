/**
 * Value lists every app record table shares (launch-2026-09-30-jxmr): the chip tones, the weekdays and
 * the soft-delete reasons. Each is the single source for the schema CHECKs and the validators.
 *
 * @remarks
 * - **Algorithm:** each object literal is the authority; the derived `*_VALUES` arrays build the
 *   CHECK constraints, so adding a value is one edit here plus a migration that replaces the CHECKs.
 * - **Failure modes:** a value outside a list violates the table's CHECK (Postgres `23514`).
 * - **Notes:** the lowercase machine values are the launch drop's (`schema-routes.md` › Enum tone,
 *   weekday, delete_reason), which clinozy-fe already sends.
 */
export const CHIP_TONE = {
  BUTTER: 'butter',
  LAVENDER: 'lav',
  SKY: 'sky',
  SAGE: 'sage',
  BLUSH: 'blush',
  MINT: 'mint',
  PEACH: 'peach',
  PLUM: 'plum',
  LIME: 'lime',
  SLATE: 'slate',
  STONE: 'stone',
} as const;

/** Literal union of {@link CHIP_TONE} values. */
export type ChipTone = (typeof CHIP_TONE)[keyof typeof CHIP_TONE];

/** All chip tones, used to derive the `chk_<table>_tone` constraints. */
export const CHIP_TONE_VALUES = Object.values(CHIP_TONE) as ChipTone[];

/** Days of the week as the drop writes them (`working_days` lists). */
export const WEEKDAY = {
  MONDAY: 'mon',
  TUESDAY: 'tue',
  WEDNESDAY: 'wed',
  THURSDAY: 'thu',
  FRIDAY: 'fri',
  SATURDAY: 'sat',
  SUNDAY: 'sun',
} as const;

/** Literal union of {@link WEEKDAY} values. */
export type Weekday = (typeof WEEKDAY)[keyof typeof WEEKDAY];

/** All weekdays, Monday first, used to derive the `chk_<table>_working_days_allowed` constraints. */
export const WEEKDAY_VALUES = Object.values(WEEKDAY) as Weekday[];
/** The days a new branch or staff member works: Monday to Saturday. */
export const DEFAULT_WORKING_DAYS: readonly Weekday[] = [
  WEEKDAY.MONDAY,
  WEEKDAY.TUESDAY,
  WEEKDAY.WEDNESDAY,
  WEEKDAY.THURSDAY,
  WEEKDAY.FRIDAY,
  WEEKDAY.SATURDAY,
];
/** A phone number: `+91` and ten digits (`chk_<table>_phone`). */
export const PHONE_NUMBER_PATTERN = '^\\+91\\d{10}$';

/**
 * An Indian mobile number: `+91` and ten digits starting 6–9. A branch's phone is a mobile, never a
 * landline — the product's rule, which the app's Branch drawer applies too. Narrower than
 * {@link PHONE_NUMBER_PATTERN}, the column's own check (`chk_branches_phone`).
 */
export const MOBILE_NUMBER_PATTERN = '^\\+91[6-9]\\d{9}$';

/** GSTIN: state code, PAN, entity number, `Z`, check character (`chk_<table>_gst_number` — branches, suppliers). */
export const GST_NUMBER_PATTERN = '^\\d{2}[A-Z]{5}\\d{4}[A-Z]\\d[Z][A-Z\\d]$';

/** Why an app record was soft-deleted (the confirm drawer's choices). */
export const RECORD_DELETE_REASON = {
  MISTAKE: 'mistake',
  DUPLICATE: 'duplicate',
  NOT_NEEDED: 'not_needed',
  OTHER: 'other',
} as const;

/** Literal union of {@link RECORD_DELETE_REASON} values. */
export type RecordDeleteReason = (typeof RECORD_DELETE_REASON)[keyof typeof RECORD_DELETE_REASON];

/** All delete reasons, used to derive the `chk_<table>_delete_reason` constraints. */
export const RECORD_DELETE_REASON_VALUES = Object.values(
  RECORD_DELETE_REASON,
) as RecordDeleteReason[];

/** Longest note a soft delete may carry (required when the reason is `other`). */
export const RECORD_DELETE_NOTE_MAX_LENGTH = 280;

/**
 * The most of anything counted on one record line — a bill line's quantity, a package's sessions,
 * a treatment's session number (TR8: packages up to 999).
 */
export const RECORD_COUNT_MAX = 999;

/**
 * The longest short label a record carries — a manufacturer or kit name, a treatment parameter's
 * value, what stock was used for, a check-in's context line.
 */
export const RECORD_LABEL_MAX = 80;

/**
 * The longest short text a record carries — a diagnosis or clinical item, a file or display name,
 * an MR visit's samples.
 */
export const RECORD_SHORT_TEXT_MAX = 120;

/** The furthest a record's date may sit from today, in days — a day's back-date, an MR's next visit. */
export const RECORD_DATE_WINDOW_DAYS_MAX = 120;

/** The most of a small two-digit count — an offer's extra sessions, a suggested quantity. */
export const RECORD_SMALL_COUNT_MAX = 99;
