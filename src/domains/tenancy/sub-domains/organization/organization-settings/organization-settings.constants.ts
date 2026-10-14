import { SEVEN_DAYS } from '@/shared/constants/ttl.constants.js';

/**
 * Opening cash a business day starts with when there is no previous close to carry from, in rupees
 * (`numeric(12,2)` string, as Drizzle reads and writes `numeric`).
 */
export const ORGANIZATION_SETTINGS_DEFAULT_DAY_FLOAT = '2000.00';

/** Idle days after which a held lead opens to the whole team. */
export const ORGANIZATION_SETTINGS_DEFAULT_LEAD_HOLD_DAYS = 3;

/** Hour of the day (0–23, the organization's timezone) the day-before appointment reminder goes out. */
export const ORGANIZATION_SETTINGS_DEFAULT_REMINDER_HOUR = 16;

/** Days without a visit after which a consenting patient gets a re-target lead. */
export const ORGANIZATION_SETTINGS_DEFAULT_RETARGET_AFTER_DAYS = 90;

/** Days a soft-deleted app record stays restorable before the purge erases it. */
export const ORGANIZATION_SETTINGS_DEFAULT_DELETED_RECORD_PURGE_DAYS = SEVEN_DAYS;

/**
 * The clinic-setup steps whose answers have no record of their own to read back — step 1 (what kind of
 * clinic) and step 3 (whether the owner sees patients); step 2 is read from the main branch.
 */
export const ORGANIZATION_SETTINGS_SETUP_ANSWERED_STEP_VALUES = ['clinic_type', 'you'] as const;

/**
 * The setup guide's items a manager may skip; booking the first appointment cannot be skipped.
 */
export const ORGANIZATION_SETTINGS_SETUP_SKIPPABLE_ITEM_VALUES = [
  'treatments',
  'invite_team',
] as const;
