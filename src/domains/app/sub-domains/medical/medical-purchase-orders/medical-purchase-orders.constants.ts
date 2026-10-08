import { RECORD_DELETE_REASON } from '@/shared/constants/record-fields.constants.js';

/** An order's stage (MD15): ordered, then received — "Paid" is its payment status. */
export const MEDICAL_PURCHASE_ORDER_STAGE = {
  ORDERED: 'ordered',
  RECEIVED: 'received',
} as const;

/** Allowed values of `medical_purchase_orders.stage`. */
export const MEDICAL_PURCHASE_ORDER_STAGE_VALUES = [
  MEDICAL_PURCHASE_ORDER_STAGE.ORDERED,
  MEDICAL_PURCHASE_ORDER_STAGE.RECEIVED,
] as const;

/** Why an order was cancelled (MD15 — the cancel is its delete). */
export const MEDICAL_PURCHASE_ORDER_CANCEL_REASON_VALUES = [
  RECORD_DELETE_REASON.MISTAKE,
  'supplier_cant_deliver',
  'price_changed',
  RECORD_DELETE_REASON.OTHER,
] as const;

/** Most lines an order carries (MD15). */
export const MEDICAL_PURCHASE_ORDER_ITEMS_MAX = 50;

/** A received line without an expiry expires this many months after the order date (MD16). */
export const MEDICAL_PURCHASE_ORDER_DEFAULT_EXPIRY_MONTHS = 24;

/** An order's payment status (MD15) — generated from what is due. */
export const MEDICAL_PURCHASE_ORDER_PAYMENT_STATUS_VALUES = ['unpaid', 'partial', 'paid'] as const;
