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

/** Why a supplier credit is voided (MD32): `delete_reason` — `other` needs a note. */
export const SUPPLIER_CREDIT_VOID_REASON = {
  MISTAKE: 'mistake',
  WRONG_QUANTITY: 'wrong_quantity',
  SUPPLIER_REFUSED: 'supplier_refused',
  OTHER: 'other',
} as const;

/** Allowed values of a voided supplier credit's `delete_reason`. */
export const SUPPLIER_CREDIT_VOID_REASON_VALUES = [
  SUPPLIER_CREDIT_VOID_REASON.MISTAKE,
  SUPPLIER_CREDIT_VOID_REASON.WRONG_QUANTITY,
  SUPPLIER_CREDIT_VOID_REASON.SUPPLIER_REFUSED,
  SUPPLIER_CREDIT_VOID_REASON.OTHER,
] as const;
