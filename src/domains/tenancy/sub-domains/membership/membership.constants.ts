import {
  CHIP_TONE,
  RECORD_DELETE_REASON,
  RECORD_SHORT_TEXT_MAX,
} from '@/shared/constants/record-fields.constants.js';

/**
 * A membership's status (`tenancy.memberships.status`, launch T17 — lowercase like every enum in the
 * API): invited until the invite is accepted, then active; suspended keeps roles and branches.
 */
export const MEMBERSHIP_STATUS = {
  INVITED: 'invited',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
} as const;

/** Literal union of {@link MEMBERSHIP_STATUS} values. */
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[keyof typeof MEMBERSHIP_STATUS];

/** Every membership status, used to derive `chk_memberships_status` and the DTO enums. */
export const MEMBERSHIP_STATUS_VALUES = Object.values(MEMBERSHIP_STATUS) as [
  MembershipStatus,
  ...MembershipStatus[],
];

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

/**
 * Why a membership ended (`tenancy.memberships.delete_reason`, launch K2): a manager's removal
 * picks one of the record reasons; leaving records `left`, deleting the account `account_deleted`.
 */
export const MEMBERSHIP_DELETE_REASON = {
  ...RECORD_DELETE_REASON,
  LEFT: 'left',
  ACCOUNT_DELETED: 'account_deleted',
} as const;

/** Literal union of {@link MEMBERSHIP_DELETE_REASON} values. */
export type MembershipDeleteReason =
  (typeof MEMBERSHIP_DELETE_REASON)[keyof typeof MEMBERSHIP_DELETE_REASON];

/** Every membership end reason, used to derive `chk_memberships_delete_reason`. */
export const MEMBERSHIP_DELETE_REASON_VALUES = Object.values(
  MEMBERSHIP_DELETE_REASON,
) as MembershipDeleteReason[];

/** Longest name an organization keeps for a member (`tenancy.memberships.display_name`, K3). */
export const MEMBERSHIP_DISPLAY_NAME_MAX_LENGTH = RECORD_SHORT_TEXT_MAX;
