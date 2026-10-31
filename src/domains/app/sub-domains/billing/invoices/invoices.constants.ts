import { RECORD_COUNT_MAX } from '@/shared/constants/record-fields.constants.js';

/** An invoice's type (B8): its lines are offerings (clinic, consultation) or medicines (medical). */
export const INVOICE_TYPE = {
  CLINIC: 'clinic',
  CONSULTATION: 'consultation',
  MEDICAL: 'medical',
} as const;

/** Allowed values of `invoices.type`. */
export const INVOICE_TYPE_VALUES = [
  INVOICE_TYPE.CLINIC,
  INVOICE_TYPE.CONSULTATION,
  INVOICE_TYPE.MEDICAL,
] as const;

/** An invoice's derived payment status (B5): nothing due, part paid, nothing paid. */
export const INVOICE_PAYMENT_STATUS = {
  PAID: 'paid',
  PARTIAL: 'partial',
  UNPAID: 'unpaid',
} as const;

/** The values of `invoices.payment_status`. */
export const INVOICE_PAYMENT_STATUS_VALUES = [
  INVOICE_PAYMENT_STATUS.PAID,
  INVOICE_PAYMENT_STATUS.PARTIAL,
  INVOICE_PAYMENT_STATUS.UNPAID,
] as const;

/** The GST rates a line can carry (B9). */
export const INVOICE_ITEM_GST_PERCENT_VALUES = [0, 5, 12, 18, 28] as const;

/** Most lines on one invoice. */
export const INVOICE_ITEMS_MAX = 50;

/** Most of one line. */
export const INVOICE_ITEM_QUANTITY_MAX = RECORD_COUNT_MAX;

/** Most members credited on one invoice (B15). */
export const INVOICE_MEMBERS_MAX = 10;

/** The longest description a line carries, printed under its name (feat-bill-line-description BD1). */
export const INVOICE_ITEM_DESCRIPTION_MAX = 280;

/** The longest printed remark. */
export const INVOICE_REMARK_MAX = 500;

/** The offering categories whose line creates a patient offering (PK4). */
export const INVOICE_SESSION_CATEGORY_VALUES = ['treatment', 'package', 'lhr'] as const;
