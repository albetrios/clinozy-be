import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  moneySchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `supplier-credits` routes. */
export const supplierCreditsIdParamsDto = z
  .object({
    supplier_credit_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new supplier credit. */
export const CreateSupplierCreditDto = z
  .object({
    supplier_id: recordIdSchema,
    medicine_id: recordIdSchema.nullable().optional(),
    batch_number: trimmedStringMinMax(1, 20).nullable().optional(),
    quantity: z.number().int().min(1).max(99999),
    amount: moneySchema,
  })
  .strict();

/** Body of `PATCH /app/supplier-credits/{supplier_credit_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateSupplierCreditDto = z
  .object({
    supplier_id: recordIdSchema.optional(),
    medicine_id: recordIdSchema.nullable().optional(),
    batch_number: trimmedStringMinMax(1, 20).nullable().optional(),
    quantity: z.number().int().min(1).max(99999).optional(),
    amount: moneySchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `supplier-credits` list — keyset paging, `q` search, sort and filters. */
export const listSupplierCreditsQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    supplier_id: recordIdSchema.optional(),
    medicine_id: recordIdSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateSupplierCreditDto}. */
export type CreateSupplierCreditInput = z.infer<typeof CreateSupplierCreditDto>;
/** Parsed {@link UpdateSupplierCreditDto}. */
export type UpdateSupplierCreditInput = z.infer<typeof UpdateSupplierCreditDto>;
