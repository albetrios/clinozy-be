/** A supplier credit's status (MD11): open until fully applied to the supplier's dues. */
export const SUPPLIER_CREDIT_STATUS = {
  OPEN: 'open',
  ADJUSTED: 'adjusted',
} as const;

/** Allowed values of a supplier credit's `status`. */
export const SUPPLIER_CREDIT_STATUS_VALUES = [
  SUPPLIER_CREDIT_STATUS.OPEN,
  SUPPLIER_CREDIT_STATUS.ADJUSTED,
] as const;
