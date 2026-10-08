import { DEFAULT_WORKING_DAYS, CHIP_TONE } from '@/shared/constants/record-fields.constants.js';

/** Chip tone a new branch starts with. */
export const BRANCH_DEFAULT_TONE = CHIP_TONE.SAGE;

/** State a new branch starts with (the launch organizations are in Gujarat). */
export const BRANCH_DEFAULT_STATE = 'Gujarat';

/** Opening time a new branch starts with (`HH:mm`, the organization's timezone). */
export const BRANCH_DEFAULT_OPENS_AT = '10:00';

/** Closing time a new branch starts with (`HH:mm`, after the opening time). */
export const BRANCH_DEFAULT_CLOSES_AT = '20:00';

/** Days a new branch works: the shared default, Monday to Saturday. */
export const BRANCH_DEFAULT_WORKING_DAYS = DEFAULT_WORKING_DAYS;

/** Indian PIN code: six digits (`chk_branches_postal_code`). */
export const BRANCH_POSTAL_CODE_PATTERN = '^\\d{6}$';

/** Most team members a branch's member list takes in one save (`membership_ids` on `POST /branches` (D13) and the members `PUT`). */
export const BRANCH_MEMBERSHIP_IDS_MAX = 500;
