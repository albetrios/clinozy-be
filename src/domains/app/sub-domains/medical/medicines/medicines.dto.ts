import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  moneySchema,
  recordIdListSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  MEDICINE_BATCHES_MAX,
  MEDICINE_EXPIRY_WINDOW_DAYS_VALUES,
  MEDICINE_GST_PERCENT_VALUES,
  MEDICINE_NEAR_EXPIRY_DISCOUNT_MAX,
  MEDICINE_QUANTITY_MAX,
  MEDICINE_STOCK_LEVEL_VALUES,
  MEDICINE_SUPPLIER_PRICES_MAX,
} from './medicines.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** A pack count, 0–9999 (the design's steppers). */
const packsSchema = z.number().int().min(0).max(MEDICINE_QUANTITY_MAX);

/** `2027-03` — a batch's expiry month (MD5). */
export const expiryMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'errors:validation.yearMonthFormat');

/** The near-expiry discount, 1–90 % (MD14). */
const discountPercentSchema = z
  .number()
  .min(1)
  .max(MEDICINE_NEAR_EXPIRY_DISCOUNT_MAX)
  .multipleOf(0.01);

/**
 * One batch of a medicine (MD13): a kept one names its `id`; `batch_number` (unique per medicine,
 * any case), `expiry_month`, `quantity` (packs left), `purchase_rate`, `supplier_id`.
 */
const medicineBatchDto = z
  .object({
    id: recordIdSchema.optional(),
    batch_number: trimmedStringMinMax({ min: 1, max: 20 }),
    expiry_month: expiryMonthSchema,
    quantity: packsSchema,
    purchase_rate: moneySchema.nullable().optional(),
    supplier_id: recordIdSchema.nullable().optional(),
  })
  .strict();

/** What a supplier charges for the medicine (MD13). */
const medicineSupplierPriceDto = z
  .object({
    supplier_id: recordIdSchema,
    rate: moneySchema.refine((rate) => rate > 0, { message: 'errors:validation.moreThanZero' }),
    free_quantity: packsSchema.optional(),
    lead_days: z.number().int().min(0).max(365).optional(),
  })
  .strict();

/** The whole batch list (each number once, in any case; each kept batch once). */
const batchesSchema = z
  .array(medicineBatchDto)
  .max(MEDICINE_BATCHES_MAX)
  .refine((batches) => distinct(batches.map((batch) => batch.batch_number.toLowerCase())), {
    message: 'errors:validation.eachBatchNumberOnce',
  })
  .refine((batches) => distinct(batches.flatMap((batch) => (batch.id ? [batch.id] : []))), {
    message: 'errors:validation.eachBatchOnce',
  });

/** The supplier prices (each supplier once). */
const supplierPricesSchema = z
  .array(medicineSupplierPriceDto)
  .max(MEDICINE_SUPPLIER_PRICES_MAX)
  .refine((prices) => distinct(prices.map((price) => price.supplier_id)), {
    message: 'errors:validation.eachSupplierOnce',
  });

/** The fields a create and a change share (routes-final 11.D.8). */
const medicineFields = {
  name: trimmedStringMinMax({ min: 1, max: 120 }),
  composition: trimmedStringMinMax({ min: 1, max: 160 }).nullable(),
  manufacturer_id: recordIdSchema,
  is_prescription_only: z.boolean(),
  mrp: moneySchema,
  gst_percent: z.literal(MEDICINE_GST_PERCENT_VALUES),
  min_stock: packsSchema,
  max_stock: packsSchema,
  near_expiry_discount_percent: discountPercentSchema.nullable(),
};

/** Path params of the by-id medicine routes. */
export const medicinesIdParamsDto = z
  .object({
    medicine_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/medicines` (11.D.8 #19): `name*`, `mrp*` and `manufacturer_id*` (both
 * optional on a quick medicine); optional `composition`, `is_prescription_only`, `gst_percent`,
 * `min_stock`, `max_stock`, `near_expiry_discount_percent`, `is_quick`, `batches`,
 * `supplier_prices`.
 */
export const CreateMedicineDto = z
  .object({
    name: medicineFields.name,
    composition: medicineFields.composition.optional(),
    manufacturer_id: medicineFields.manufacturer_id.optional(),
    is_prescription_only: medicineFields.is_prescription_only.optional(),
    mrp: medicineFields.mrp.optional(),
    gst_percent: medicineFields.gst_percent.optional(),
    min_stock: medicineFields.min_stock.optional(),
    max_stock: medicineFields.max_stock.optional(),
    near_expiry_discount_percent: medicineFields.near_expiry_discount_percent.optional(),
    is_quick: z.boolean().optional(),
    batches: batchesSchema.optional(),
    supplier_prices: supplierPricesSchema.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/medicines/{medicine_id}` (11.D.8 #21): any field of the create but
 * `is_quick`; `batches` is the whole list (a kept one with its `id`), `supplier_prices` replaces
 * the prices; `null` clears the composition and the discount; `expected_updated_at` refuses a
 * stale save.
 */
export const UpdateMedicineDto = z
  .object({
    name: medicineFields.name.optional(),
    composition: medicineFields.composition.optional(),
    manufacturer_id: medicineFields.manufacturer_id.optional(),
    is_prescription_only: medicineFields.is_prescription_only.optional(),
    mrp: medicineFields.mrp.optional(),
    gst_percent: medicineFields.gst_percent.optional(),
    min_stock: medicineFields.min_stock.optional(),
    max_stock: medicineFields.max_stock.optional(),
    near_expiry_discount_percent: medicineFields.near_expiry_discount_percent.optional(),
    batches: batchesSchema.optional(),
    supplier_prices: supplierPricesSchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Body of `POST /app/medicines/near-expiry-discount` (11.D.8 #24, MD14): the window (30, 60 or
 * 90 days) and the discount — `null` removes it.
 */
export const NearExpiryDiscountDto = z
  .object({
    expiring_within_days: z.literal(MEDICINE_EXPIRY_WINDOW_DAYS_VALUES),
    discount_percent: discountPercentSchema.nullable(),
  })
  .strict();

/**
 * Query of the Medicines tab, the pickers and the export (11.D.8 #17, #18): `q` (name,
 * composition, `#458`), `manufacturer_id` and `stock_level` (several), `expiring_within_days`,
 * `supplier_id`, `is_quick`, the created range; sort `name` (default) | `medicine_number` |
 * `quantity` | `mrp` | `nearest_expiry` | `manufacturer_name` | `margin_percent` (MD27) | `created_at`.
 */
export const listMedicinesQueryDto = listSearchSortSchema([
  'name',
  'medicine_number',
  'quantity',
  'mrp',
  'nearest_expiry',
  'manufacturer_name',
  'margin_percent',
  'created_at',
] as const)
  .extend({
    manufacturer_id: recordIdListSchema.optional(),
    stock_level: valueListSchema(MEDICINE_STOCK_LEVEL_VALUES).optional(),
    expiring_within_days: z.enum(['30', '60', '90']).optional(),
    supplier_id: recordIdSchema.optional(),
    is_quick: z.enum(['true', 'false']).optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateMedicineDto}. */
export type CreateMedicineInput = z.infer<typeof CreateMedicineDto>;
/** Parsed {@link UpdateMedicineDto}. */
export type UpdateMedicineInput = z.infer<typeof UpdateMedicineDto>;
/** One batch as a save sends it. */
export type MedicineBatchInput = z.infer<typeof medicineBatchDto>;
/** One supplier price as a save sends it. */
export type MedicineSupplierPriceInput = z.infer<typeof medicineSupplierPriceDto>;
