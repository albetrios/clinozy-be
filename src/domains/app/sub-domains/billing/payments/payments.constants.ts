/** Which way a payment's money moves (B17). */
export const PAYMENT_DIRECTION = {
  RECEIVED: 'received',
  PAID: 'paid',
} as const;

/** Allowed values of `payments.direction`. */
export const PAYMENT_DIRECTION_VALUES = [
  PAYMENT_DIRECTION.RECEIVED,
  PAYMENT_DIRECTION.PAID,
] as const;

/** A payment's kind — it fixes the direction (B17). */
export const PAYMENT_KIND = {
  RECEIPT: 'receipt',
  MONEY_BACK: 'money_back',
  EXPENSE: 'expense',
  SUPPLIER_BILL: 'supplier_bill',
  REFUND: 'refund',
  REVERSAL: 'reversal',
} as const;

/** Allowed values of `payments.kind`. */
export const PAYMENT_KIND_VALUES = [
  PAYMENT_KIND.RECEIPT,
  PAYMENT_KIND.MONEY_BACK,
  PAYMENT_KIND.EXPENSE,
  PAYMENT_KIND.SUPPLIER_BILL,
  PAYMENT_KIND.REFUND,
  PAYMENT_KIND.REVERSAL,
] as const;

/** The kinds money comes in by. */
export const PAYMENT_RECEIVED_KIND_VALUES = [
  PAYMENT_KIND.RECEIPT,
  PAYMENT_KIND.MONEY_BACK,
] as const;

/** The kinds `POST /payments` takes — refunds and reversals have their own routes (B17). */
export const PAYMENT_CREATE_KIND_VALUES = [
  PAYMENT_KIND.RECEIPT,
  PAYMENT_KIND.MONEY_BACK,
  PAYMENT_KIND.EXPENSE,
  PAYMENT_KIND.SUPPLIER_BILL,
] as const;

/** The kinds that name who was paid. */
export const PAYMENT_PAYEE_KIND_VALUES = [
  PAYMENT_KIND.EXPENSE,
  PAYMENT_KIND.SUPPLIER_BILL,
] as const;

/** A split's mode — each a column (B18). */
export const PAYMENT_MODE = {
  CASH: 'cash',
  UPI: 'upi',
  CARD: 'card',
  CREDIT: 'credit',
} as const;

/** Allowed split modes. */
export const PAYMENT_MODE_VALUES = [
  PAYMENT_MODE.CASH,
  PAYMENT_MODE.UPI,
  PAYMENT_MODE.CARD,
  PAYMENT_MODE.CREDIT,
] as const;

/** The modes money moves in — `credit` is only a pending credit used on a bill (B18). */
export const PAYMENT_MONEY_MODE_VALUES = [
  PAYMENT_MODE.CASH,
  PAYMENT_MODE.UPI,
  PAYMENT_MODE.CARD,
] as const;

/** Allowed values of `payments.expense_category`. */
export const PAYMENT_EXPENSE_CATEGORY_VALUES = [
  'medicines',
  'consumables',
  'salary',
  'rent',
  'marketing',
  'utilities',
  'maintenance',
  'misc',
] as const;

/** A payment's display prefix (`PAY-12`) — also read by the ledger's `q`. */
export const PAYMENT_NUMBER_PREFIX = 'PAY';

/** Most attachments on one payment. */
export const PAYMENT_ATTACHMENT_KEYS_MAX = 5;
