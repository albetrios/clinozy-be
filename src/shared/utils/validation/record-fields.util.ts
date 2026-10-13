import { z } from 'zod';
import {
  GST_NUMBER_PATTERN,
  PHONE_NUMBER_PATTERN,
  CHIP_TONE_VALUES,
  type ChipTone,
  RECORD_DELETE_NOTE_MAX_LENGTH,
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
  type RecordDeleteReason,
  WEEKDAY_VALUES,
  type Weekday,
} from '@/shared/constants/record-fields.constants.js';
import { ConflictError } from '@/shared/errors/index.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import { MILLISECONDS_PER_DAY } from '@/shared/constants/ttl.constants.js';

/** `HH:mm`, 00:00–23:59. */
const HOUR_MINUTE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A chip tone from {@link CHIP_TONE_VALUES}. */
export const chipToneSchema = z.enum(CHIP_TONE_VALUES as [ChipTone, ...ChipTone[]]);

/** A time of day as `HH:mm` (opening hours, working hours). */
export const hourMinuteSchema = trimmedString().regex(
  HOUR_MINUTE,
  'errors:validation.hourMinuteFormat',
);

/** One to seven distinct weekdays (`working_days`). */
export const workingDaysSchema = z
  .array(z.enum(WEEKDAY_VALUES as [Weekday, ...Weekday[]]))
  .min(1)
  .max(WEEKDAY_VALUES.length)
  .refine((days) => new Set(days).size === days.length, {
    message: 'errors:validation.eachDayOnce',
  });

/** An Indian mobile or landline as `+91` and ten digits ({@link PHONE_NUMBER_PATTERN}). */
export const phoneNumberSchema = trimmedString().regex(
  new RegExp(PHONE_NUMBER_PATTERN),
  'errors:validation.indianPhoneFormat',
);

/** A GSTIN ({@link GST_NUMBER_PATTERN}) — a branch's, a supplier's. */
export const gstNumberSchema = trimmedString().regex(
  new RegExp(GST_NUMBER_PATTERN),
  'errors:validation.invalidGstin',
);

/**
 * The reason and note an app record's soft delete carries — the query string of a
 * `DELETE` route (a `DELETE` has no body).
 *
 * @remarks
 * - **Algorithm:** `reason` is one of {@link RECORD_DELETE_REASON_VALUES}; `note` is trimmed and at
 *   most {@link RECORD_DELETE_NOTE_MAX_LENGTH} characters, and required when the reason is `other`.
 * - **Failure modes:** a missing reason, an unknown one, or `other` without a note fails the parse.
 */
export const recordDeleteQuerySchema = recordDeleteQuerySchemaOf(
  RECORD_DELETE_REASON_VALUES as [RecordDeleteReason, ...RecordDeleteReason[]],
);

/**
 * The `DELETE` query for a record with its own reasons — an order's cancel, a sale's void (launch
 * #153, MD15, MD20): `reason` one of `reasons`, `note` required for `other`.
 *
 * @remarks
 * - **Algorithm:** as {@link recordDeleteQuerySchema}, on the given reason list.
 * - **Failure modes:** a missing reason, an unknown one, or `other` without a note fails the parse.
 */
export function recordDeleteQuerySchemaOf<const Reasons extends readonly [string, ...string[]]>(
  reasons: Reasons,
) {
  return z
    .object({
      reason: z.enum(reasons).meta({
        description: `Why it goes (required): ${reasons.join(' · ')}`,
        example: reasons[0],
      }),
      note: trimmedString()
        .min(1)
        .max(RECORD_DELETE_NOTE_MAX_LENGTH)
        .optional()
        .meta({
          description: `In words, up to ${RECORD_DELETE_NOTE_MAX_LENGTH} characters — required when the reason is other`,
        }),
    })
    .strict()
    .refine((value) => value.reason !== RECORD_DELETE_REASON.OTHER || value.note !== undefined, {
      path: ['note'],
      message: 'errors:validation.noteWhenReasonIsOther',
    });
}

/** Parsed {@link recordDeleteQuerySchema}. */
export type RecordDeleteQuery = z.infer<typeof recordDeleteQuerySchema>;

/**
 * Adds an issue on `endField` when both times are given and the end is not after the start — the
 * shared rule behind opening hours (`closes_at` after `opens_at`) and working hours.
 *
 * @remarks
 * - **Algorithm:** compares the two `HH:mm` strings lexically (zero-padded, so lexical order is
 *   time order); a missing side skips the check — the service re-checks a partial update against
 *   the stored row.
 * - **Failure modes:** none; it only adds a Zod issue.
 */
export function addEndAfterStartIssue(options: {
  start: string | undefined;
  end: string | undefined;
  endField: string;
  message: string;
  context: z.RefinementCtx;
}): void {
  if (options.start && options.end && options.end <= options.start) {
    options.context.addIssue({
      code: 'custom',
      path: [options.endField],
      message: options.message,
    });
  }
}

/**
 * A Postgres `time` value (`HH:mm:ss`) as the API speaks it (`HH:mm`).
 *
 * @remarks
 * - **Algorithm:** the first five characters; seconds are never stored by these routes.
 * - **Failure modes:** none.
 */
export function toHourMinute(value: string): string {
  return value.slice(0, 5);
}

/** Rupees with paise (`numeric(12,2)`), as a number with at most two decimals. */
export const moneySchema = z.number().min(0).max(9_999_999_999.99).multipleOf(0.01);

/** A percent with at most two decimals (`numeric(5,2)`, 0–100). */
export const percentSchema = z.number().min(0).max(100).multipleOf(0.01);

/**
 * An `https://` web address of at most `maxLength` characters (a branch's map or review link, a
 * patient review's link — TR11); any other scheme is refused.
 */
export function httpsLinkSchema(maxLength: number): z.ZodType<string> {
  return trimmedString()
    .max(maxLength)
    .pipe(
      z.url().refine((url) => url.startsWith('https://'), {
        message: 'errors:validation.linkMustUseHttps',
      }),
    );
}

/** A calendar date as `YYYY-MM-DD` (Postgres `date`). */
export const calendarDateSchema = z.iso.date();

/** An instant as ISO 8601 with an offset (the validator turns it into a `Date` for `timestamptz`). */
export const instantSchema = z.iso.datetime({ offset: true });

/** A referenced record's public id (`pat_…`); the service resolves it inside the organization. */
export const recordIdSchema = trimmedStringMinMax({ min: 1, max: 28 });

/**
 * The OpenAPI extension key a comma-separated public-id query list carries (`true`): the document
 * generator reads it to give the parameter a list of prefixed ids as its example
 * (`brn_…,brn_…`) — the list itself does not know which entity its ids name.
 */
export const COMMA_SEPARATED_ID_LIST_OPENAPI_EXTENSION = 'x-comma-separated-id-list';

/**
 * A query list of up to `maximum` public ids, comma-separated (`?ids=con_…,con_…`); split it with
 * {@link splitRecordIds}.
 *
 * @remarks
 * - **Notes:** carries its OpenAPI description and the
 *   {@link COMMA_SEPARATED_ID_LIST_OPENAPI_EXTENSION} marker as Zod metadata (documentation only —
 *   validation is the regex).
 */
export function recordIdListSchemaOf(maximum: number): z.ZodString {
  return z
    .string()
    .regex(
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp — built once per call site from a code constant (the id cap), never from input; linear pattern
      new RegExp(`^[a-z0-9_]{1,28}(,[a-z0-9_]{1,28}){0,${maximum - 1}}$`),
      `Up to ${maximum} ids, comma-separated`,
    )
    .meta({
      description: `Several: up to ${maximum} public ids, comma-separated.`,
      [COMMA_SEPARATED_ID_LIST_OPENAPI_EXTENSION]: true,
    });
}

/**
 * A query list of up to 20 public ids, comma-separated (`?branch_ids=brn_…,brn_…`); split it
 * with {@link splitRecordIds}.
 */
export const recordIdListSchema = recordIdListSchemaOf(20);

/**
 * A query list of allowed values, comma-separated and each once (`?status=new,contacted`) — split
 * it with `value.split(',')`.
 *
 * @remarks
 * - **Notes:** carries its OpenAPI description and example (the first two values,
 *   `?kind=rule,follow_up`) as Zod metadata — documentation only; validation is the regex and the
 *   each-once check.
 */
export function valueListSchema(values: readonly string[]): z.ZodType<string> {
  const body = values.join('|');
  const quotedValues = values.map((value) => `\`${value}\``).join(', ');
  return (
    z
      .string()
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp — built once per call site from a code enum (the allowed values), never from input; linear pattern
      .regex(new RegExp(`^(${body})(,(${body}))*$`), `Comma-separated: ${values.join(', ')}`)
      .refine((value) => new Set(value.split(',')).size === value.split(',').length, {
        message: 'errors:validation.eachValueOnce',
      })
      .meta({
        description: `Several, comma-separated, each once: ${quotedValues}.`,
        example: values.slice(0, 2).join(','),
      })
  );
}

/** The ids of a {@link recordIdListSchema} value (none when absent). */
export function splitRecordIds(value: string | undefined): string[] {
  return value === undefined ? [] : value.split(',');
}

/**
 * The version a client opened (`updated_at` as it read it) — a save of an older version is refused
 * with who changed it and when (D43).
 */
export const expectedUpdatedAtSchema = z.iso.datetime({ offset: true }).optional();

/**
 * D43: a save sent with `expected_updated_at` older than the stored row is refused — `409
 * record_changed`, naming who changed it and when. The one check behind every `PATCH` that takes
 * `expected_updated_at`: the app record kernel, branches, memberships and roles.
 *
 * @remarks
 * - **Algorithm:** no `expected` (not a string) → no check; equal instants → allowed; otherwise the
 *   editor's public id comes from `resolveUserPublicId`.
 * - **Failure modes:** `ConflictError('errors:recordChangedSinceOpened')` with reason
 *   `record_changed`.
 */
export async function assertRecordNotChangedSince(options: {
  row: { updated_at: Date; updated_by_user_id: number | null };
  expected: unknown;
  resolveUserPublicId: (userInternalId: number) => Promise<string | null>;
}): Promise<void> {
  if (typeof options.expected !== 'string') return;
  if (new Date(options.expected).getTime() === options.row.updated_at.getTime()) return;
  const updatedBy =
    options.row.updated_by_user_id === null
      ? null
      : await options.resolveUserPublicId(options.row.updated_by_user_id);
  throw new ConflictError('errors:recordChangedSinceOpened', {
    updated_at: options.row.updated_at.toISOString(),
    updated_by: updatedBy ?? 'someone',
  }).withReason('record_changed');
}

/**
 * `₹1,500.00` — an amount as an activity entry, an event or a message shows it.
 *
 * @remarks
 * - **Algorithm:** Indian digit grouping (`en-IN`), always two decimals.
 * - **Failure modes:** none.
 */
export function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * A stored `numeric` (decimal text) as the number the API speaks.
 *
 * @remarks
 * - **Algorithm:** `Number()` of the text; `null` stays `null`.
 * - **Failure modes:** none.
 */
export function toAmount(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/**
 * An amount in whole paise — the exact integer the money rules add and compare.
 *
 * @remarks
 * - **Algorithm:** {@link toAmount} of a number or a stored `numeric` (decimal text), × 100, rounded;
 *   `null` / missing is 0.
 * - **Failure modes:** none.
 */
export function paiseOf(value: unknown): number {
  return Math.round((toAmount(value) ?? 0) * 100);
}

/**
 * An amount rounded to whole paise (two decimals), as the API answers money.
 *
 * @remarks
 * - **Algorithm:** `Math.round(value × 100) / 100`.
 * - **Failure modes:** none.
 */
export function roundToPaise(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A stored `timestamptz` as ISO 8601 (UTC).
 *
 * @remarks
 * - **Algorithm:** a `Date` → `toISOString()`; text passes through; `null` stays `null`.
 * - **Failure modes:** none.
 */
export function toInstant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toText(value);
}

/**
 * A list query's instant range (`created_from` / `created_to`, `due_from` / `due_to`, …) as the
 * repository's `Date` bounds — the one reader every list validator hands its ranges through.
 *
 * @remarks
 * - **Algorithm:** each ISO string → `new Date(value)`; a bound the query leaves out stays
 *   `undefined`, so the repository skips it.
 * - **Failure modes:** none — the DTO already checked each bound's format.
 */
export function queryInstantRange({
  from,
  to,
}: {
  from: string | undefined;
  to: string | undefined;
}): { from: Date | undefined; to: Date | undefined } {
  return {
    from: from === undefined ? undefined : new Date(from),
    to: to === undefined ? undefined : new Date(to),
  };
}

/**
 * A stored value as text — the one way a row's `unknown` column reaches a string.
 *
 * @remarks
 * - **Algorithm:** `null` / `undefined` → `''`; text passes through; a number, boolean or bigint
 *   prints itself; a `Date` → `toISOString()`; anything else (an array, a JSON object) → JSON.
 * - **Failure modes:** none.
 */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value) ?? '';
}

/** Rupees that may be negative (an adjustment, a reversal), with at most two decimals. */
export const signedMoneySchema = z
  .number()
  .min(-9_999_999_999.99)
  .max(9_999_999_999.99)
  .multipleOf(0.01);

/**
 * A parsed body with its instant fields as `Date`s (Postgres `timestamptz`).
 *
 * @remarks
 * - **Algorithm:** each named field that holds an ISO string becomes a `Date`; `null` and absent
 *   fields pass through.
 * - **Failure modes:** none — the DTO already checked the format.
 */
export function withInstants<T extends Record<string, unknown>>({
  values,
  fields,
}: {
  values: T;
  fields: readonly string[];
}): T {
  const out: Record<string, unknown> = { ...values };
  for (const field of fields) {
    const value = out[field];
    if (typeof value === 'string') out[field] = new Date(value);
  }
  return out as T;
}

/**
 * The calendar date (`YYYY-MM-DD`) it is at `at` in an IANA time zone — "today" for an
 * organization whose timed work runs in its own zone (D41).
 */
export function calendarDateInTimeZone({
  timeZone,
  at = new Date(),
}: {
  timeZone: string;
  at?: Date | undefined;
}): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Whether `value` is an IANA time zone this runtime knows (`Asia/Kolkata`). */
export function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock time (`HH:mm`, 24-hour) it is at `at` in an IANA time zone — a clinic's "now". */
export function clockTimeInTimeZone({
  timeZone,
  at = new Date(),
}: {
  timeZone: string;
  at?: Date | undefined;
}): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** Minutes in a day — the clock arithmetic of slots. */
const MINUTES_PER_DAY = 1440;
/** `Date#getUTCDay()` order (Sunday first) of the {@link Weekday} values. */
const WEEKDAY_BY_UTC_DAY: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Minutes since midnight of an `HH:mm` (or `HH:mm:ss`) clock time. */
export function minutesOfClockTime(value: string): number {
  const [hours, minutes] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** The `HH:mm` clock time of minutes since midnight (wrapping past midnight). */
export function clockTimeOfMinutes(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = String(Math.floor(wrapped / 60)).padStart(2, '0');
  return `${hours}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** The weekday (`mon` … `sun`) of a calendar date (`YYYY-MM-DD`). */
export function weekdayOfCalendarDate(date: string): Weekday {
  return WEEKDAY_BY_UTC_DAY[new Date(`${date}T00:00:00Z`).getUTCDay()] as Weekday;
}

/** Whole days from the calendar date `from` to `to` (negative when `to` is earlier). */
export function daysBetweenCalendarDates(options: { from: string; to: string }): number {
  return Math.round(
    (Date.parse(`${options.to}T00:00:00Z`) - Date.parse(`${options.from}T00:00:00Z`)) /
      MILLISECONDS_PER_DAY,
  );
}

/** The calendar date `days` after `date` (negative for before). */
export function addDaysToCalendarDate(options: { date: string; days: number }): string {
  const at = new Date(`${options.date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + options.days);
  return at.toISOString().slice(0, 10);
}

/**
 * The instant a wall-clock date and time in an IANA time zone names (`2026-10-07` `10:30` in
 * `Asia/Kolkata` → `2026-10-07T05:00:00Z`).
 *
 * @remarks
 * - **Algorithm:** reads the zone's offset at the naive UTC guess, then once more at the corrected
 *   instant, so a date across a daylight-saving change lands on the zone's own reading.
 * - **Failure modes:** a time skipped by a daylight-saving jump resolves to the later offset.
 */
export function instantInTimeZone(options: { date: string; time: string; timeZone: string }): Date {
  const naive = Date.parse(`${options.date}T${options.time.slice(0, 5)}:00Z`);
  const offsetAt = (instant: number): number => {
    const reading = `${calendarDateInTimeZone({ timeZone: options.timeZone, at: new Date(instant) })}T${clockTimeInTimeZone({ timeZone: options.timeZone, at: new Date(instant) })}:00Z`;
    return Date.parse(reading) - instant;
  };
  const firstGuess = naive - offsetAt(naive);
  return new Date(naive - offsetAt(firstGuess));
}
