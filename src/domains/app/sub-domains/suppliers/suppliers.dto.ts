import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  phoneNumberSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id `suppliers` routes. */
export const suppliersIdParamsDto = z
  .object({
    supplier_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new supplier. */
export const CreateSupplierDto = z
  .object({
    name: trimmedStringMinMax(1, 120),
    phone: phoneNumberSchema.nullable().optional(),
    gst_number: trimmedString()
      .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/, 'Not a valid GSTIN')
      .nullable()
      .optional(),
    manufacturer_ids: z
      .array(recordIdSchema)
      .max(50)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    is_quick: z.boolean().optional(),
  })
  .strict();

/** Body of `PATCH /app/suppliers/{supplier_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateSupplierDto = z
  .object({
    name: trimmedStringMinMax(1, 120).optional(),
    phone: phoneNumberSchema.nullable().optional(),
    gst_number: trimmedString()
      .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/, 'Not a valid GSTIN')
      .nullable()
      .optional(),
    manufacturer_ids: z
      .array(recordIdSchema)
      .max(50)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    is_quick: z.boolean().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `suppliers` list — keyset paging, `q` search, sort and filters. */
export const listSuppliersQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateSupplierDto}. */
export type CreateSupplierInput = z.infer<typeof CreateSupplierDto>;
/** Parsed {@link UpdateSupplierDto}. */
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierDto>;
