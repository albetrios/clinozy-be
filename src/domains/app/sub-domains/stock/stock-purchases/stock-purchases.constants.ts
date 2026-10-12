/** Most lines one purchase holds (S10). */
export const STOCK_PURCHASE_ITEMS_MAX = 50;

/** A purchase's generated payment status (S11) — as an invoice's. */
export const STOCK_PURCHASE_PAYMENT_STATUS = {
  PAID: 'paid',
  PARTIAL: 'partial',
  UNPAID: 'unpaid',
} as const;

/** Allowed values of `stock_purchases.payment_status`. */
export const STOCK_PURCHASE_PAYMENT_STATUS_VALUES = [
  STOCK_PURCHASE_PAYMENT_STATUS.PAID,
  STOCK_PURCHASE_PAYMENT_STATUS.PARTIAL,
  STOCK_PURCHASE_PAYMENT_STATUS.UNPAID,
] as const;
