import { CHIP_TONE } from '@/shared/constants/record-fields.constants.js';

/** Badge tone a new staff member starts with (the drawer's default swatch). */
export const MEMBERSHIP_DEFAULT_TONE = CHIP_TONE.SKY;
/** Start of a new staff member's working hours (`HH:mm`, the organization's timezone). */
export const MEMBERSHIP_DEFAULT_WORK_STARTS_AT = '10:00';
/** End of a new staff member's working hours (`HH:mm`, after the start). */
export const MEMBERSHIP_DEFAULT_WORK_ENDS_AT = '19:00';
/** Highest commission a staff member may earn, in percent of what they bill. */
export const MEMBERSHIP_COMMISSION_PERCENT_MAX = 100;
/** Most roles one person may hold — the main role plus the additional ones (D5). */
export const MEMBERSHIP_ROLE_IDS_MAX = 10;
