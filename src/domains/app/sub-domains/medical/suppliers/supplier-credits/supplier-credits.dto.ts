import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { recordIdSchema } from '@/shared/utils/validation/record-fields.util.js';
import { MEDICINE_QUANTITY_MAX } from '@/domains/app/sub-domains/medical/medicines/medicines.constants.js';
import { SUPPLIER_CREDIT_STATUS_VALUES } from './supplier-credits.constants.js';

/** Path params of the by-id supplier credit route. */
export const supplierCreditsIdParamsDto = z
  .object({
    supplier_credit_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/supplier-credits` (11.C.8 #15) — "Return expiring stock": the batch, the
 * supplier taking it back and how many packs (up to what the batch holds).
 */
export const CreateSupplierCreditDto = z
  .object({
    medicine_batch_id: recordIdSchema,
    supplier_id: recordIdSchema,
    quantity: z.number().int().min(1).max(MEDICINE_QUANTITY_MAX),
  })
  .strict();

/**
 * Query of the credits list (11.C.8 #14): `supplier_id`, `medicine_id`, `status`; sort
 * `created_at` (default, newest first).
 */
export const listSupplierCreditsQueryDto = listSearchSortSchema(['created_at'] as const)
  .omit({ q: true })
  .extend({
    supplier_id: recordIdSchema.optional(),
    medicine_id: recordIdSchema.optional(),
    status: z.enum(SUPPLIER_CREDIT_STATUS_VALUES).optional(),
  })
  .strict();

/** Parsed {@link CreateSupplierCreditDto}. */
export type CreateSupplierCreditInput = z.infer<typeof CreateSupplierCreditDto>;
