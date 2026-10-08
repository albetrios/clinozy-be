import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  STOCK_ITEM_CATEGORY_VALUES,
  STOCK_ITEM_LEVEL_VALUES,
  STOCK_ITEM_MEASURE_UNIT_VALUES,
  STOCK_ITEM_UNIT_VALUES,
  STOCK_QUANTITY_MAX,
} from './stock-items.constants.js';

/** A stock quantity — 0 or more, up to three decimals (`numeric(12,3)`, S4). */
export const stockQuantitySchema = z.number().min(0).max(STOCK_QUANTITY_MAX).multipleOf(0.001);

/** A stock quantity above 0. */
export const positiveStockQuantitySchema = stockQuantitySchema.refine((value) => value > 0, {
  message: 'More than 0',
});

/** The fields a create and a change share (routes-final 9.A.8 #3). */
const stockItemFields = {
  name: trimmedStringMinMax(1, 120),
  category: z.enum(STOCK_ITEM_CATEGORY_VALUES),
  unit: z.enum(STOCK_ITEM_UNIT_VALUES),
  size_per_unit: positiveStockQuantitySchema.nullable(),
  measure_unit: z.enum(STOCK_ITEM_MEASURE_UNIT_VALUES).nullable(),
  min_quantity: stockQuantitySchema,
  max_quantity: stockQuantitySchema,
  usage_per_week: stockQuantitySchema,
  stock_vendor_id: recordIdSchema.nullable(),
};

/** Path params of the by-id stock item routes. */
export const stockItemsIdParamsDto = z
  .object({
    stock_item_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/stock-items` (9.A.8 #3): `name*` (unique, any case); optional `category`,
 * `unit`, `size_per_unit` + `measure_unit` (both or neither), `min_quantity`, `max_quantity` (not
 * under the minimum), `usage_per_week`, `stock_vendor_id`, `opening_quantity` (an `opening`
 * movement).
 */
export const CreateStockItemDto = z
  .object({
    name: stockItemFields.name,
    category: stockItemFields.category.optional(),
    unit: stockItemFields.unit.optional(),
    size_per_unit: stockItemFields.size_per_unit.optional(),
    measure_unit: stockItemFields.measure_unit.optional(),
    min_quantity: stockItemFields.min_quantity.optional(),
    max_quantity: stockItemFields.max_quantity.optional(),
    usage_per_week: stockItemFields.usage_per_week.optional(),
    stock_vendor_id: stockItemFields.stock_vendor_id.optional(),
    opening_quantity: stockQuantitySchema.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/stock-items/{stock_item_id}` (9.A.8 #5) — any field of the create but
 * `opening_quantity` (the quantity moves only with a movement, S5; null clears an optional one);
 * `expected_updated_at` refuses a stale save (D43).
 */
export const UpdateStockItemDto = z
  .object({
    name: stockItemFields.name.optional(),
    category: stockItemFields.category.optional(),
    unit: stockItemFields.unit.optional(),
    size_per_unit: stockItemFields.size_per_unit.optional(),
    measure_unit: stockItemFields.measure_unit.optional(),
    min_quantity: stockItemFields.min_quantity.optional(),
    max_quantity: stockItemFields.max_quantity.optional(),
    usage_per_week: stockItemFields.usage_per_week.optional(),
    stock_vendor_id: stockItemFields.stock_vendor_id.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of the Items tab and its export (9.A.8 #1, #2): `q` (name, `#167`), `category` and
 * `stock_level` (several), `stock_vendor_id`, the created range; sort `name` (default, A–Z) |
 * `stock_item_number` | `category` | `quantity` | `lasts_days` | `created_at`.
 */
export const listStockItemsQueryDto = listSearchSortSchema([
  'name',
  'stock_item_number',
  'category',
  'quantity',
  'lasts_days',
  'created_at',
] as const)
  .extend({
    category: valueListSchema(STOCK_ITEM_CATEGORY_VALUES).optional(),
    stock_level: valueListSchema(STOCK_ITEM_LEVEL_VALUES).optional(),
    stock_vendor_id: recordIdSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateStockItemDto}. */
export type CreateStockItemInput = z.infer<typeof CreateStockItemDto>;
/** Parsed {@link UpdateStockItemDto}. */
export type UpdateStockItemInput = z.infer<typeof UpdateStockItemDto>;
