import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  gstNumberSchema,
  instantSchema,
  phoneNumberSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { invoicePaidNowDto } from '@/domains/app/sub-domains/billing/invoices/invoices.dto.js';
import { SUPPLIER_MANUFACTURERS_MAX } from './suppliers.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** The fields a create and a change share (routes-final 11.B.8). */
const supplierFields = {
  name: trimmedStringMinMax({ min: 1, max: 120 }),
  phone: phoneNumberSchema.nullable(),
  gst_number: gstNumberSchema.nullable(),
  manufacturer_ids: z
    .array(recordIdSchema)
    .max(SUPPLIER_MANUFACTURERS_MAX)
    .refine(distinct, { message: 'Each manufacturer once' }),
};

/** Path params of the by-id supplier routes. */
export const suppliersIdParamsDto = z
  .object({
    supplier_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/suppliers` (11.B.8 #8): `name*` ("Agency name", unique in any case);
 * optional `phone` (`+91` and ten digits), `gst_number` (a GSTIN), `manufacturer_ids`
 * ("Distributes", up to 50), `is_quick` (a picker's inline add).
 */
export const CreateSupplierDto = z
  .object({
    name: supplierFields.name,
    phone: supplierFields.phone.optional(),
    gst_number: supplierFields.gst_number.optional(),
    manufacturer_ids: supplierFields.manufacturer_ids.optional(),
    is_quick: z.boolean().optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/suppliers/{supplier_id}` (11.B.8 #10): `name`, `phone`, `gst_number` (null
 * clears either), `manufacturer_ids` (replaces the links); `expected_updated_at` refuses a stale
 * save.
 */
export const UpdateSupplierDto = z
  .object({
    name: supplierFields.name.optional(),
    phone: supplierFields.phone.optional(),
    gst_number: supplierFields.gst_number.optional(),
    manufacturer_ids: supplierFields.manufacturer_ids.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Body of `POST /app/suppliers/{supplier_id}/payments` (11.B.8 #13) — "Pay ₹827": `branch_id*`
 * (the paying branch, one of yours), `splits*` (1–3 of cash · UPI · card, each once); optional
 * `paid_at` (an open day), `reference`, `note`.
 */
export const PaySupplierDto = z
  .object({
    branch_id: recordIdSchema,
    splits: invoicePaidNowDto.shape.splits,
    paid_at: instantSchema.optional(),
    reference: trimmedStringMinMax({ min: 1, max: 60 }).optional(),
    note: trimmedStringMinMax({ min: 1, max: 280 }).optional(),
  })
  .strict();

/**
 * Query of the Suppliers tab and picker (11.B.8 #7): `q` (name, phone), `manufacturer_id`,
 * `has_payable`, the created range; sort `name` (default, A–Z) | `payable` | `created_at`.
 */
export const listSuppliersQueryDto = listSearchSortSchema([
  'name',
  'payable',
  'created_at',
] as const)
  .extend({
    manufacturer_id: recordIdSchema.optional(),
    has_payable: z.enum(['true', 'false']).optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateSupplierDto}. */
export type CreateSupplierInput = z.infer<typeof CreateSupplierDto>;
/** Parsed {@link UpdateSupplierDto}. */
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierDto>;
/** Parsed {@link PaySupplierDto}. */
export type PaySupplierInput = z.infer<typeof PaySupplierDto>;
