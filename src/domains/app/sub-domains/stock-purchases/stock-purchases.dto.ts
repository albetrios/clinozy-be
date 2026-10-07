import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  moneySchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `stock-purchases` routes. */
export const stockPurchasesIdParamsDto = z
  .object({
    stock_purchase_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new stock purchase. */
export const CreateStockPurchaseDto = z
  .object({
    stock_vendor_id: recordIdSchema,
    bill_number: trimmedStringMinMax(1, 30).nullable().optional(),
    purchase_date: calendarDateSchema,
    lines: z
      .array(
        z
          .object({
            stock_item_id: recordIdSchema,
            quantity_milli: z.number().int().min(1),
            rate: moneySchema,
          })
          .strict(),
      )
      .max(50)
      .optional(),
    bill_amount: moneySchema.optional(),
    paid_amount: moneySchema.optional(),
  })
  .strict();

/** Body of `PATCH /app/stock-purchases/{stock_purchase_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateStockPurchaseDto = z
  .object({
    stock_vendor_id: recordIdSchema.optional(),
    bill_number: trimmedStringMinMax(1, 30).nullable().optional(),
    purchase_date: calendarDateSchema.optional(),
    lines: z
      .array(
        z
          .object({
            stock_item_id: recordIdSchema,
            quantity_milli: z.number().int().min(1),
            rate: moneySchema,
          })
          .strict(),
      )
      .max(50)
      .optional(),
    bill_amount: moneySchema.optional(),
    paid_amount: moneySchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `stock-purchases` list — keyset paging, `q` search, sort and filters. */
export const listStockPurchasesQueryDto = listSearchSortSchema([
  'created_at',
  'purchase_date',
] as const)
  .extend({
    stock_vendor_id: recordIdSchema.optional(),
    purchase_date_from: calendarDateSchema.optional(),
    purchase_date_to: calendarDateSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateStockPurchaseDto}. */
export type CreateStockPurchaseInput = z.infer<typeof CreateStockPurchaseDto>;
/** Parsed {@link UpdateStockPurchaseDto}. */
export type UpdateStockPurchaseInput = z.infer<typeof UpdateStockPurchaseDto>;
