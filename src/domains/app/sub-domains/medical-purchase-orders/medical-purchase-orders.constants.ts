/** Allowed values of `medical_purchase_orders.stage`. */
export const MEDICAL_PURCHASE_ORDER_STAGE_VALUES = [
  'ordered',
  'received',
  'paid',
  'cancelled',
] as const;

/** Allowed values of `medical_purchase_orders.cancel_reason`. */
export const MEDICAL_PURCHASE_ORDER_CANCEL_REASON_VALUES = [
  'mistake',
  'duplicate',
  'not_needed',
  'other',
] as const;
