import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import {
  instantSchema,
  recordDeleteQuerySchemaOf,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { MEDICINE_QUANTITY_MAX } from '@/domains/app/sub-domains/medical/medicines/medicines.constants.js';
import {
  SUPPLIER_CREDIT_STATUS_VALUES,
  SUPPLIER_CREDIT_VOID_REASON_VALUES,
} from './supplier-credits.constants.js';

/** Path params of a supplier's credits (`/suppliers/{supplier_id}/credits`, MD34). */
export const supplierCreditsParentParamsDto = z
  .object({
    supplier_id: recordIdSchema,
  })
  .strict();

/** Path params of one credit under its supplier (`…/credits/{supplier_credit_id}`, MD34). */
export const supplierCreditsIdParamsDto = z
  .object({
    supplier_id: recordIdSchema,
    supplier_credit_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/suppliers/{supplier_id}/credits` (11.C.8 #15) — "Return expiring stock": the
 * batch and how many packs (up to what the batch holds); the supplier is the path's (MD34).
 */
export const CreateSupplierCreditDto = z
  .object({
    medicine_batch_id: recordIdSchema,
    quantity: z.number().int().min(1).max(MEDICINE_QUANTITY_MAX),
  })
  .strict();

/** The void's query — why (MD32): mistake, wrong_quantity, supplier_refused, other. */
export const voidSupplierCreditQueryDto = recordDeleteQuerySchemaOf(
  SUPPLIER_CREDIT_VOID_REASON_VALUES,
);

/**
 * Query of the credits list (11.C.8 #14): `supplier_id`, `medicine_id`, `status`, the created range
 * (`created_from`, `created_to` — the latter exclusive); sort `created_at` (default, newest first).
 */
export const listSupplierCreditsQueryDto = listSearchSortSchema(['created_at'] as const)
  .omit({ q: true })
  .extend({
    supplier_id: recordIdSchema.optional(),
    medicine_id: recordIdSchema.optional(),
    status: z.enum(SUPPLIER_CREDIT_STATUS_VALUES).optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Query of a supplier's credits (11.C.8 #57, MD34) — as #14, the supplier being the path's. */
export const listSupplierAccountCreditsQueryDto = listSupplierCreditsQueryDto
  .omit({ supplier_id: true })
  .strict();

/** Parsed {@link CreateSupplierCreditDto}. */
export type CreateSupplierCreditInput = z.infer<typeof CreateSupplierCreditDto>;
