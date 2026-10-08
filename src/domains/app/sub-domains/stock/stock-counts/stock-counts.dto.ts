import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { instantSchema, recordIdSchema } from '@/shared/utils/validation/record-fields.util.js';
import { stockQuantitySchema } from '@/domains/app/sub-domains/stock/stock-items/stock-items.dto.js';
import { STOCK_COUNT_LINES_MAX } from './stock-counts.constants.js';

/** Path params of the by-id stock count route. */
export const stockCountsIdParamsDto = z
  .object({
    stock_count_id: recordIdSchema,
  })
  .strict();

/** One counted item: the item and how much is there. */
const stockCountLineDto = z
  .object({
    stock_item_id: recordIdSchema,
    counted_quantity: stockQuantitySchema,
  })
  .strict();

/**
 * Body of `POST /app/stock-counts` (9.C.8 #14): `lines*` — 1–500 counted items
 * (`stock_item_id*`, `counted_quantity*` 0 or more), each item once. The system quantities are the
 * server's.
 */
export const CreateStockCountDto = z
  .object({
    lines: z
      .array(stockCountLineDto)
      .min(1)
      .max(STOCK_COUNT_LINES_MAX)
      .refine((lines) => new Set(lines.map((line) => line.stock_item_id)).size === lines.length, {
        message: 'Each item once',
      }),
  })
  .strict();

/**
 * Query of past stock checks (9.C.8 #13): the counted range (`to` exclusive); sort `counted_at`
 * (default, newest first) | `created_at`.
 */
export const listStockCountsQueryDto = listSearchSortSchema(['counted_at', 'created_at'] as const)
  .omit({ q: true })
  .extend({
    counted_from: instantSchema.optional(),
    counted_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateStockCountDto}. */
export type CreateStockCountInput = z.infer<typeof CreateStockCountDto>;
