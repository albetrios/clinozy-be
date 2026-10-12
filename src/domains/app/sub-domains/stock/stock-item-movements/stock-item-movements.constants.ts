import { RECORD_LABEL_MAX } from '@/shared/constants/record-fields.constants.js';
/** A movement's type — it fixes the sign of its change (S7). */
export const STOCK_ITEM_MOVEMENT_TYPE = {
  OPENING: 'opening',
  RECEIVED: 'received',
  USED: 'used',
  DAMAGED: 'damaged',
  RETURNED: 'returned',
  ADJUST: 'adjust',
  REVERTED: 'reverted',
} as const;

/** Allowed values of `stock_item_movements.type`. */
export const STOCK_ITEM_MOVEMENT_TYPE_VALUES = [
  STOCK_ITEM_MOVEMENT_TYPE.OPENING,
  STOCK_ITEM_MOVEMENT_TYPE.RECEIVED,
  STOCK_ITEM_MOVEMENT_TYPE.USED,
  STOCK_ITEM_MOVEMENT_TYPE.DAMAGED,
  STOCK_ITEM_MOVEMENT_TYPE.RETURNED,
  STOCK_ITEM_MOVEMENT_TYPE.ADJUST,
  STOCK_ITEM_MOVEMENT_TYPE.REVERTED,
] as const;

/** The types that add stock. */
export const STOCK_ITEM_MOVEMENT_ADDING_TYPE_VALUES = [
  STOCK_ITEM_MOVEMENT_TYPE.OPENING,
  STOCK_ITEM_MOVEMENT_TYPE.RECEIVED,
] as const;

/** The types that take stock out. */
export const STOCK_ITEM_MOVEMENT_TAKING_TYPE_VALUES = [
  STOCK_ITEM_MOVEMENT_TYPE.USED,
  STOCK_ITEM_MOVEMENT_TYPE.DAMAGED,
  STOCK_ITEM_MOVEMENT_TYPE.RETURNED,
] as const;

/** The types a movement by hand takes (route 10) — `adjust` sends the counted quantity. */
export const STOCK_ITEM_MOVEMENT_MANUAL_TYPE_VALUES = [
  STOCK_ITEM_MOVEMENT_TYPE.USED,
  STOCK_ITEM_MOVEMENT_TYPE.RECEIVED,
  STOCK_ITEM_MOVEMENT_TYPE.DAMAGED,
  STOCK_ITEM_MOVEMENT_TYPE.RETURNED,
  STOCK_ITEM_MOVEMENT_TYPE.ADJUST,
] as const;

/** Why a movement was reverted (S8). */
export const STOCK_ITEM_MOVEMENT_REVERT_REASON = {
  MISTAKE: 'mistake',
  WRONG_ITEM: 'wrong_item',
  WRONG_QUANTITY: 'wrong_quantity',
  OTHER: 'other',
} as const;

/** Allowed values of `stock_item_movements.revert_reason`. */
export const STOCK_ITEM_MOVEMENT_REVERT_REASON_VALUES = [
  STOCK_ITEM_MOVEMENT_REVERT_REASON.MISTAKE,
  STOCK_ITEM_MOVEMENT_REVERT_REASON.WRONG_ITEM,
  STOCK_ITEM_MOVEMENT_REVERT_REASON.WRONG_QUANTITY,
  STOCK_ITEM_MOVEMENT_REVERT_REASON.OTHER,
] as const;

/** Longest "Used for". */
export const STOCK_ITEM_MOVEMENT_USED_FOR_MAX = RECORD_LABEL_MAX;

/** Longest note (the design's Remark). */
export const STOCK_ITEM_MOVEMENT_NOTE_MAX = 280;
