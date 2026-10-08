import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  instantSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { stockQuantitySchema } from '@/domains/app/sub-domains/stock/stock-items/stock-items.dto.js';
import {
  STOCK_ITEM_MOVEMENT_MANUAL_TYPE_VALUES,
  STOCK_ITEM_MOVEMENT_NOTE_MAX,
  STOCK_ITEM_MOVEMENT_REVERT_REASON,
  STOCK_ITEM_MOVEMENT_REVERT_REASON_VALUES,
  STOCK_ITEM_MOVEMENT_TYPE,
  STOCK_ITEM_MOVEMENT_TYPE_VALUES,
  STOCK_ITEM_MOVEMENT_USED_FOR_MAX,
} from './stock-item-movements.constants.js';

/** Path params of an item's movement list and its create (routes 9, 10). */
export const stockItemMovementsParentParamsDto = z
  .object({
    stock_item_id: recordIdSchema,
  })
  .strict();

/** Path params of one movement of an item (routes 11, 12). */
export const stockItemMovementsIdParamsDto = z
  .object({
    stock_item_id: recordIdSchema,
    stock_item_movement_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/stock-items/{stock_item_id}/movements` (9.B.8 #10): `type*` (`used` ·
 * `received` · `damaged` · `returned` · `adjust`), `quantity*` — how much was used, received,
 * damaged or returned (more than 0), or for `adjust` the counted quantity (0 or more; the server
 * writes the difference); `used_for` and `patient_treatment_id` only on `used`; optional `note`.
 */
export const CreateStockItemMovementDto = z
  .object({
    type: z.enum(STOCK_ITEM_MOVEMENT_MANUAL_TYPE_VALUES),
    quantity: stockQuantitySchema,
    used_for: trimmedStringMinMax(1, STOCK_ITEM_MOVEMENT_USED_FOR_MAX).optional(),
    patient_treatment_id: recordIdSchema.optional(),
    note: trimmedStringMinMax(1, STOCK_ITEM_MOVEMENT_NOTE_MAX).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type !== STOCK_ITEM_MOVEMENT_TYPE.ADJUST && value.quantity <= 0) {
      context.addIssue({ code: 'custom', path: ['quantity'], message: 'More than 0' });
    }
    if (value.type === STOCK_ITEM_MOVEMENT_TYPE.USED) return;
    for (const field of ['used_for', 'patient_treatment_id'] as const) {
      if (value[field] !== undefined) {
        context.addIssue({ code: 'custom', path: [field], message: 'Only on used' });
      }
    }
  });

/**
 * Body of `POST …/movements/{stock_item_movement_id}/revert` (9.B.8 #12): `reason*` (`mistake` ·
 * `wrong_item` · `wrong_quantity` · `other`); `note` (required for `other`).
 */
export const RevertStockItemMovementDto = z
  .object({
    reason: z.enum(STOCK_ITEM_MOVEMENT_REVERT_REASON_VALUES),
    note: trimmedStringMinMax(1, STOCK_ITEM_MOVEMENT_NOTE_MAX).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reason === STOCK_ITEM_MOVEMENT_REVERT_REASON.OTHER && value.note === undefined) {
      context.addIssue({ code: 'custom', path: ['note'], message: 'Required for other' });
    }
  });

/**
 * Query of the Movements tab (9.B.8 #8): `stock_item_id`, `type` (several),
 * `patient_treatment_id` (a session's stock), `author_membership_id`, the created range; sort
 * `created_at` (default, newest first).
 */
export const listStockItemMovementsQueryDto = listSearchSortSchema(['created_at'] as const)
  .omit({ q: true })
  .extend({
    stock_item_id: recordIdSchema.optional(),
    type: valueListSchema(STOCK_ITEM_MOVEMENT_TYPE_VALUES).optional(),
    patient_treatment_id: recordIdSchema.optional(),
    author_membership_id: recordIdSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Query of an item's history (9.B.8 #9) — as the Movements tab, without `stock_item_id`. */
export const listItemStockItemMovementsQueryDto = listStockItemMovementsQueryDto
  .omit({ stock_item_id: true })
  .strict();

/** Parsed {@link CreateStockItemMovementDto}. */
export type CreateStockItemMovementInput = z.infer<typeof CreateStockItemMovementDto>;
/** Parsed {@link RevertStockItemMovementDto}. */
export type RevertStockItemMovementInput = z.infer<typeof RevertStockItemMovementDto>;
