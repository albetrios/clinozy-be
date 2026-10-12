/** Allowed values of `stock_items.category` (S6). */
export const STOCK_ITEM_CATEGORY_VALUES = [
  'creams_serums',
  'peels',
  'masks',
  'consumables',
  'equipment',
  'other',
] as const;

/** Allowed values of `stock_items.unit` (S6). */
export const STOCK_ITEM_UNIT_VALUES = [
  'piece',
  'tube',
  'bottle',
  'kit',
  'pack',
  'box',
  'vial',
  'ampoule',
  'sachet',
  'jar',
  'roll',
  'pair',
  'ml',
  'g',
  'litre',
] as const;

/** Allowed values of `stock_items.measure_unit` — what one unit holds (S6). */
export const STOCK_ITEM_MEASURE_UNIT_VALUES = ['ml', 'g', 'pcs', 'units'] as const;

/** An item's derived stock level (S6): `out` at zero, `low` at or under the minimum. */
export const STOCK_ITEM_LEVEL = {
  OK: 'ok',
  LOW: 'low',
  OUT: 'out',
} as const;

/** Allowed values of the derived `stock_level`. */
export const STOCK_ITEM_LEVEL_VALUES = [
  STOCK_ITEM_LEVEL.OK,
  STOCK_ITEM_LEVEL.LOW,
  STOCK_ITEM_LEVEL.OUT,
] as const;

/** A new item's minimum when none is sent (S6). */
export const STOCK_ITEM_DEFAULT_MIN_QUANTITY = 1;

/** A new item's maximum when none is sent (S6). */
export const STOCK_ITEM_DEFAULT_MAX_QUANTITY = 10;

/** Largest quantity a `numeric(12,3)` stock column holds. */
export const STOCK_QUANTITY_MAX = 999_999_999.999;

/** The most days the Items tab's `lasts_days_to` filter takes — ten years (D81). */
export const STOCK_LASTS_DAYS_FILTER_MAX = 3650;
