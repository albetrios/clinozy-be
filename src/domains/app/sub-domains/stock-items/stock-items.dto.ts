import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  STOCK_ITEM_CATEGORY_VALUES,
  STOCK_ITEM_UNIT_VALUES,
  STOCK_ITEM_MEASURE_UNIT_VALUES,
} from './stock-items.constants.js';

/** Path params of the by-id `stock-items` routes. */
export const stockItemsIdParamsDto = z
  .object({
    stock_item_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new stock item. */
export const CreateStockItemDto = z
  .object({
    name: trimmedStringMinMax(1, 120),
    category: z.enum(STOCK_ITEM_CATEGORY_VALUES).optional(),
    unit: z.enum(STOCK_ITEM_UNIT_VALUES).optional(),
    size_per_unit_milli: z.number().int().nullable().optional(),
    measure_unit: z.enum(STOCK_ITEM_MEASURE_UNIT_VALUES).nullable().optional(),
    min_quantity: z.number().int().min(0).max(99999).optional(),
    max_quantity: z.number().int().min(0).max(99999).optional(),
    usage_per_week_milli: z.number().int().min(0).optional(),
    stock_vendor_id: recordIdSchema.nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/stock-items/{stock_item_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateStockItemDto = z
  .object({
    name: trimmedStringMinMax(1, 120).optional(),
    category: z.enum(STOCK_ITEM_CATEGORY_VALUES).optional(),
    unit: z.enum(STOCK_ITEM_UNIT_VALUES).optional(),
    size_per_unit_milli: z.number().int().nullable().optional(),
    measure_unit: z.enum(STOCK_ITEM_MEASURE_UNIT_VALUES).nullable().optional(),
    min_quantity: z.number().int().min(0).max(99999).optional(),
    max_quantity: z.number().int().min(0).max(99999).optional(),
    usage_per_week_milli: z.number().int().min(0).optional(),
    stock_vendor_id: recordIdSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `stock-items` list — keyset paging, `q` search, sort and filters. */
export const listStockItemsQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    category: z.enum(STOCK_ITEM_CATEGORY_VALUES).optional(),
    stock_vendor_id: recordIdSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateStockItemDto}. */
export type CreateStockItemInput = z.infer<typeof CreateStockItemDto>;
/** Parsed {@link UpdateStockItemDto}. */
export type UpdateStockItemInput = z.infer<typeof UpdateStockItemDto>;
