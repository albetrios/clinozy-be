/** Allowed values of `stock_movements.type`. */
export const STOCK_MOVEMENT_TYPE_VALUES = [
  'used',
  'received',
  'adjust',
  'damaged',
  'returned',
  'reverted',
] as const;

/** Allowed values of `stock_movements.revert_reason`. */
export const STOCK_MOVEMENT_REVERT_REASON_VALUES = [
  'mistake',
  'wrong_item',
  'wrong_quantity',
  'other',
] as const;
