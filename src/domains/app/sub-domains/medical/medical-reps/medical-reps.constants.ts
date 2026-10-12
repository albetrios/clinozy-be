import { RECORD_DATE_WINDOW_DAYS_MAX } from '@/shared/constants/record-fields.constants.js';
/** Most manufacturers an MR represents (MD17). */
export const MEDICAL_REP_MANUFACTURERS_MAX = 20;

/** How far ahead an MR's next visit may be set (MD17, MD18 — "Today and the next 120 days"). */
export const MEDICAL_REP_NEXT_VISIT_DAYS_MAX = RECORD_DATE_WINDOW_DAYS_MAX;
