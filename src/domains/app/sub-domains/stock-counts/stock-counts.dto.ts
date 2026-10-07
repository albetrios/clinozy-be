import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `stock-counts` routes. */
export const stockCountsIdParamsDto = z
  .object({
    stock_count_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new stock count. */
export const CreateStockCountDto = z
  .object({
    lines: z
      .array(
        z
          .object({
            stock_item_id: recordIdSchema,
            system_milli: z.number().int().min(0),
            counted_milli: z.number().int().min(0),
          })
          .strict(),
      )
      .max(500)
      .optional(),
  })
  .strict();

/** Body of `PATCH /app/stock-counts/{stock_count_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateStockCountDto = z
  .object({
    lines: z
      .array(
        z
          .object({
            stock_item_id: recordIdSchema,
            system_milli: z.number().int().min(0),
            counted_milli: z.number().int().min(0),
          })
          .strict(),
      )
      .max(500)
      .optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `stock-counts` list — keyset paging, `q` search, sort and filters. */
export const listStockCountsQueryDto = listSearchSortSchema(['created_at', 'counted_at'] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateStockCountDto}. */
export type CreateStockCountInput = z.infer<typeof CreateStockCountDto>;
/** Parsed {@link UpdateStockCountDto}. */
export type UpdateStockCountInput = z.infer<typeof UpdateStockCountDto>;
