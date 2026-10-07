/** Allowed values of `stock_items.category`. */
export const STOCK_ITEM_CATEGORY_VALUES = [
  'creams_serums',
  'peels',
  'masks',
  'consumables',
  'equipment',
  'other',
] as const;

/** Allowed values of `stock_items.unit`. */
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

/** Allowed values of `stock_items.measure_unit`. */
export const STOCK_ITEM_MEASURE_UNIT_VALUES = ['ml', 'g', 'pcs', 'units'] as const;
