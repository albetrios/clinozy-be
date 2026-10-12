import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  phoneNumberSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** The fields a create and a change share (routes-final 9.E.8). */
const stockVendorFields = {
  name: trimmedStringMinMax({ min: 1, max: 120 }),
  phone: phoneNumberSchema.nullable(),
};

/** Path params of the by-id stock vendor routes. */
export const stockVendorsIdParamsDto = z
  .object({
    stock_vendor_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/stock-vendors` (9.E.8 #24): `name*` (unique, any case); optional `phone`
 * (`+91` and ten digits), `is_quick` (the picker's inline add).
 */
export const CreateStockVendorDto = z
  .object({
    name: stockVendorFields.name,
    phone: stockVendorFields.phone.optional(),
    is_quick: z.boolean().optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/stock-vendors/{stock_vendor_id}` (9.E.8 #26): `name`, `phone` (null clears
 * it); `expected_updated_at` refuses a stale save (D43).
 */
export const UpdateStockVendorDto = z
  .object({
    name: stockVendorFields.name.optional(),
    phone: stockVendorFields.phone.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Query of the vendor picker and the Vendors tab (9.E.8 #23): `q` (name), the created range; sort
 * `name` (default, A–Z) | `created_at` | `payable` (most owed first, D81).
 */
export const listStockVendorsQueryDto = listSearchSortSchema([
  'name',
  'created_at',
  'payable',
] as const)
  .extend({
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateStockVendorDto}. */
export type CreateStockVendorInput = z.infer<typeof CreateStockVendorDto>;
/** Parsed {@link UpdateStockVendorDto}. */
export type UpdateStockVendorInput = z.infer<typeof UpdateStockVendorDto>;
