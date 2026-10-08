/** A medicine's GST rate (MD12). */
export const MEDICINE_GST_PERCENT_VALUES = [0, 5, 12, 18, 28] as const;

/** The GST rate a medicine starts with ("preselected 12%"). */
export const MEDICINE_DEFAULT_GST_PERCENT = 12;

/** "Reorder at" and "Fill up to" start here (MD12). */
export const MEDICINE_DEFAULT_MIN_STOCK = 2;

/** "Fill up to" starts here (MD12). */
export const MEDICINE_DEFAULT_MAX_STOCK = 10;

/** The highest stock level and batch quantity (the design's 4-digit steppers). */
export const MEDICINE_QUANTITY_MAX = 9999;

/** A medicine's stock against its reorder level (MD12). */
export const MEDICINE_STOCK_LEVEL = {
  OK: 'ok',
  LOW: 'low',
  OUT: 'out',
} as const;

/** Allowed values of the medicines list's `stock_level`. */
export const MEDICINE_STOCK_LEVEL_VALUES = [
  MEDICINE_STOCK_LEVEL.OK,
  MEDICINE_STOCK_LEVEL.LOW,
  MEDICINE_STOCK_LEVEL.OUT,
] as const;

/** The "Nearest expiry" filter's windows, in days (MD12, MD14). */
export const MEDICINE_EXPIRY_WINDOW_DAYS_VALUES = [30, 60, 90] as const;

/** Most batches a medicine carries in one save (MD13). */
export const MEDICINE_BATCHES_MAX = 50;

/** Most supplier prices a medicine carries (MD13). */
export const MEDICINE_SUPPLIER_PRICES_MAX = 20;

/** The highest near-expiry discount (MD14). */
export const MEDICINE_NEAR_EXPIRY_DISCOUNT_MAX = 90;
