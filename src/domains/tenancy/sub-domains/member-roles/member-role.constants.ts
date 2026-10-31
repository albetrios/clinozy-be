import { CHIP_TONE } from '@/shared/constants/record-fields.constants.js';

/** Chip tone a new role starts with. */
export const ROLE_DEFAULT_TONE = CHIP_TONE.SKY;

/**
 * Name of the Admin system role every TEAM organization is provisioned with (launch D8, D40): every
 * code Owner holds but deleting the organization. The role a former owner moves to when ownership
 * is handed over and the request names no other.
 */
export const ADMIN_ROLE_NAME = 'Admin';
