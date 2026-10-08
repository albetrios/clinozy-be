import { RECORD_DELETE_REASON } from '@/shared/constants/record-fields.constants.js';

/** A sale's status (MD21), derived: voided, returned, paid or unpaid. */
export const MEDICAL_SALE_STATUS = {
  UNPAID: 'unpaid',
  PAID: 'paid',
  RETURNED: 'returned',
  VOIDED: 'voided',
} as const;

/** Allowed values of a sale's `status` and the list's filter. */
export const MEDICAL_SALE_STATUS_VALUES = [
  MEDICAL_SALE_STATUS.UNPAID,
  MEDICAL_SALE_STATUS.PAID,
  MEDICAL_SALE_STATUS.RETURNED,
  MEDICAL_SALE_STATUS.VOIDED,
] as const;

/** Why a sale was voided (MD20 — the void is its delete). */
export const MEDICAL_SALE_VOID_REASON_VALUES = [
  'billed_by_mistake',
  'wrong_items',
  'customer_changed_mind',
  RECORD_DELETE_REASON.OTHER,
] as const;

/** Why medicines came back (MD21). */
export const MEDICAL_SALE_RETURN_REASON = {
  UNUSED: 'unused',
  REACTION: 'reaction',
  DOCTOR_CHANGED: 'doctor_changed',
  WRONG_ITEM: 'wrong_item',
  DAMAGED: 'damaged',
} as const;

/** Allowed values of `medical_sale_returns.reason`. */
export const MEDICAL_SALE_RETURN_REASON_VALUES = [
  MEDICAL_SALE_RETURN_REASON.UNUSED,
  MEDICAL_SALE_RETURN_REASON.REACTION,
  MEDICAL_SALE_RETURN_REASON.DOCTOR_CHANGED,
  MEDICAL_SALE_RETURN_REASON.WRONG_ITEM,
  MEDICAL_SALE_RETURN_REASON.DAMAGED,
] as const;

/** The reasons whose medicines go back into their batch — the rest are written off (MD21). */
export const MEDICAL_SALE_RESTOCKED_REASON_VALUES = [
  MEDICAL_SALE_RETURN_REASON.UNUSED,
  MEDICAL_SALE_RETURN_REASON.DOCTOR_CHANGED,
  MEDICAL_SALE_RETURN_REASON.WRONG_ITEM,
] as const;

/** How a return's money goes back ("Refund by"). */
export const MEDICAL_SALE_REFUND_MODE_VALUES = ['cash', 'upi', 'card'] as const;

/** Most lines a sale carries (MD19). */
export const MEDICAL_SALE_ITEMS_MAX = 50;

/** Most team members a sale credits ("Prescribed by"). */
export const MEDICAL_SALE_MEMBERS_MAX = 10;
