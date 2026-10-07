import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { STOCK_MOVEMENT_TYPE_VALUES } from './stock-movements.constants.js';

/** Path params of the by-id `stock-movements` routes. */
export const stockMovementsIdParamsDto = z
  .object({
    stock_movement_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new stock movement. */
export const CreateStockMovementDto = z
  .object({
    stock_item_id: recordIdSchema,
    type: z.enum(STOCK_MOVEMENT_TYPE_VALUES).optional(),
    delta_milli: z.number().int(),
    used_for: trimmedStringMinMax(1, 80).nullable().optional(),
    patient_id: recordIdSchema.nullable().optional(),
    note: trimmedStringMinMax(1, 280).nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/stock-movements/{stock_movement_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateStockMovementDto = z
  .object({
    stock_item_id: recordIdSchema.optional(),
    type: z.enum(STOCK_MOVEMENT_TYPE_VALUES).optional(),
    delta_milli: z.number().int().optional(),
    used_for: trimmedStringMinMax(1, 80).nullable().optional(),
    patient_id: recordIdSchema.nullable().optional(),
    note: trimmedStringMinMax(1, 280).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `stock-movements` list — keyset paging, `q` search, sort and filters. */
export const listStockMovementsQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    stock_item_id: recordIdSchema.optional(),
    type: z.enum(STOCK_MOVEMENT_TYPE_VALUES).optional(),
    patient_id: recordIdSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateStockMovementDto}. */
export type CreateStockMovementInput = z.infer<typeof CreateStockMovementDto>;
/** Parsed {@link UpdateStockMovementDto}. */
export type UpdateStockMovementInput = z.infer<typeof UpdateStockMovementDto>;
