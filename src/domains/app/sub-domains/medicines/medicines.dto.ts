import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  moneySchema,
  percentSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `medicines` routes. */
export const medicinesIdParamsDto = z
  .object({
    medicine_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new medicine. */
export const CreateMedicineDto = z
  .object({
    name: trimmedStringMinMax(1, 120),
    composition: trimmedStringMinMax(1, 160).nullable().optional(),
    manufacturer_id: recordIdSchema,
    mrp: moneySchema,
    gst_percent: z
      .union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)])
      .optional(),
    min_stock: z.number().int().min(0).max(9999).optional(),
    max_stock: z.number().int().min(0).max(9999).optional(),
    batches: z
      .array(
        z
          .object({
            batch_number: trimmedStringMinMax(1, 20),
            expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use MM/YY'),
            quantity: z.number().int().min(0),
            purchase_rate: moneySchema,
          })
          .strict(),
      )
      .max(50)
      .optional(),
    supplier_rates: z
      .array(
        z
          .object({
            supplier_id: recordIdSchema,
            rate: moneySchema,
            free_quantity: z.number().int().min(0).optional(),
            lead_days: z.number().int().min(0).optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    is_quick: z.boolean().optional(),
    is_prescription_only: z.boolean().optional(),
    near_expiry_discount_percent: percentSchema.optional(),
  })
  .strict();

/** Body of `PATCH /app/medicines/{medicine_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateMedicineDto = z
  .object({
    name: trimmedStringMinMax(1, 120).optional(),
    composition: trimmedStringMinMax(1, 160).nullable().optional(),
    manufacturer_id: recordIdSchema.optional(),
    mrp: moneySchema.optional(),
    gst_percent: z
      .union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)])
      .optional(),
    min_stock: z.number().int().min(0).max(9999).optional(),
    max_stock: z.number().int().min(0).max(9999).optional(),
    batches: z
      .array(
        z
          .object({
            batch_number: trimmedStringMinMax(1, 20),
            expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use MM/YY'),
            quantity: z.number().int().min(0),
            purchase_rate: moneySchema,
          })
          .strict(),
      )
      .max(50)
      .optional(),
    supplier_rates: z
      .array(
        z
          .object({
            supplier_id: recordIdSchema,
            rate: moneySchema,
            free_quantity: z.number().int().min(0).optional(),
            lead_days: z.number().int().min(0).optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    is_quick: z.boolean().optional(),
    is_prescription_only: z.boolean().optional(),
    near_expiry_discount_percent: percentSchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `medicines` list — keyset paging, `q` search, sort and filters. */
export const listMedicinesQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    manufacturer_id: recordIdSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateMedicineDto}. */
export type CreateMedicineInput = z.infer<typeof CreateMedicineDto>;
/** Parsed {@link UpdateMedicineDto}. */
export type UpdateMedicineInput = z.infer<typeof UpdateMedicineDto>;
