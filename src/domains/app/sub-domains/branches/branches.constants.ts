import { CLINIC_TONE, WEEKDAY, type Weekday } from '@/shared/constants/clinic-record.constants.js';

/** Chip tone a new branch starts with. */
export const BRANCH_DEFAULT_TONE = CLINIC_TONE.SAGE;

/** State a new branch starts with (the launch clinics are in Gujarat). */
export const BRANCH_DEFAULT_STATE = 'Gujarat';

/** Opening time a new branch starts with (`HH:mm`, the organization's timezone). */
export const BRANCH_DEFAULT_OPENS_AT = '10:00';

/** Closing time a new branch starts with (`HH:mm`, after the opening time). */
export const BRANCH_DEFAULT_CLOSES_AT = '20:00';

/** Days a new branch works: Monday to Saturday. */
export const BRANCH_DEFAULT_WORKING_DAYS: readonly Weekday[] = [
  WEEKDAY.MONDAY,
  WEEKDAY.TUESDAY,
  WEEKDAY.WEDNESDAY,
  WEEKDAY.THURSDAY,
  WEEKDAY.FRIDAY,
  WEEKDAY.SATURDAY,
];

/** Indian PIN code: six digits (`chk_branches_postal_code`). */
export const BRANCH_POSTAL_CODE_PATTERN = '^\\d{6}$';

/** Branch phone: `+91` and ten digits (`chk_branches_phone`). */
export const BRANCH_PHONE_PATTERN = '^\\+91\\d{10}$';

/** GSTIN: state code, PAN, entity number, `Z`, check character (`chk_branches_gst_number`). */
export const BRANCH_GST_NUMBER_PATTERN = '^\\d{2}[A-Z]{5}\\d{4}[A-Z]\\d[Z][A-Z\\d]$';
