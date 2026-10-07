/** Allowed values of `payments.direction`. */
export const PAYMENT_DIRECTION_VALUES = ['received', 'paid'] as const;

/** Allowed values of `payments.kind`. */
export const PAYMENT_KIND_VALUES = [
  'receipt',
  'refund',
  'expense',
  'supplier_bill',
  'money_back',
  'reversal',
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
