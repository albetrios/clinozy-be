import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  moneySchema,
  recordDeleteQuerySchemaOf,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { MEDICINE_QUANTITY_MAX } from '@/domains/app/sub-domains/medical/medicines/medicines.constants.js';
import { expiryMonthSchema } from '@/domains/app/sub-domains/medical/medicines/medicines.dto.js';
import {
  MEDICAL_PURCHASE_ORDER_CANCEL_REASON_VALUES,
  MEDICAL_PURCHASE_ORDER_ITEMS_MAX,
  MEDICAL_PURCHASE_ORDER_PAYMENT_STATUS_VALUES,
  MEDICAL_PURCHASE_ORDER_STAGE_VALUES,
} from './medical-purchase-orders.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/**
 * One order line (MD15): a medicine — or `new_medicine_name`, a quick one added as typed —
 * `quantity*` (1–9999), `free_quantity`, `rate*` (above 0).
 */
const medicalPurchaseOrderItemDto = z
  .object({
    medicine_id: recordIdSchema.optional(),
    new_medicine_name: trimmedStringMinMax({ min: 1, max: 120 }).optional(),
    quantity: z.number().int().min(1).max(MEDICINE_QUANTITY_MAX),
    free_quantity: z.number().int().min(0).max(MEDICINE_QUANTITY_MAX).optional(),
    rate: moneySchema.refine((rate) => rate > 0, { message: 'More than 0' }),
  })
  .strict()
  .refine((item) => (item.medicine_id === undefined) !== (item.new_medicine_name === undefined), {
    message: 'Send a medicine_id or a new_medicine_name',
  });

/** An order's lines — 1–50. */
const itemsSchema = z
  .array(medicalPurchaseOrderItemDto)
  .min(1)
  .max(MEDICAL_PURCHASE_ORDER_ITEMS_MAX);

/** The bill number the supplier wrote. */
const supplierBillNumberSchema = trimmedStringMinMax({ min: 1, max: 30 });

/** Path params of the by-id order routes. */
export const medicalPurchaseOrdersIdParamsDto = z
  .object({
    medical_purchase_order_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/medical-purchase-orders` (11.E.8 #27): `supplier_id*`, `items*`; optional
 * `supplier_bill_number`, `order_date` (today unless sent, never after it).
 */
export const CreateMedicalPurchaseOrderDto = z
  .object({
    supplier_id: recordIdSchema,
    items: itemsSchema,
    supplier_bill_number: supplierBillNumberSchema.optional(),
    order_date: calendarDateSchema.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/medical-purchase-orders/{medical_purchase_order_id}` (11.E.8 #29) — an order
 * not yet received: `supplier_id`, `supplier_bill_number` (null clears it), `order_date`, `items`
 * (the whole list); `expected_updated_at` refuses a stale save.
 */
export const UpdateMedicalPurchaseOrderDto = z
  .object({
    supplier_id: recordIdSchema.optional(),
    supplier_bill_number: supplierBillNumberSchema.nullable().optional(),
    order_date: calendarDateSchema.optional(),
    items: itemsSchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Body of `POST …/{medical_purchase_order_id}/receive` (11.E.8 #32, MD16): optional `items`
 * (`id*`, `is_received` — default yes — `batch_number`, `expiry_month`) and `supplier_bill_number`.
 */
export const ReceiveMedicalPurchaseOrderDto = z
  .object({
    items: z
      .array(
        z
          .object({
            id: recordIdSchema,
            is_received: z.boolean().optional(),
            batch_number: trimmedStringMinMax({ min: 1, max: 20 }).optional(),
            expiry_month: expiryMonthSchema.optional(),
          })
          .strict(),
      )
      .max(MEDICAL_PURCHASE_ORDER_ITEMS_MAX)
      .refine((items) => distinct(items.map((item) => item.id)), { message: 'Each line once' })
      .optional(),
    supplier_bill_number: supplierBillNumberSchema.optional(),
  })
  .strict();

/** The cancel's query — why (MD15): mistake, supplier_cant_deliver, price_changed, other. */
export const cancelMedicalPurchaseOrderQueryDto = recordDeleteQuerySchemaOf(
  MEDICAL_PURCHASE_ORDER_CANCEL_REASON_VALUES,
);

/**
 * Query of the Purchases tab and its CSV (11.E.8 #25, #26): `q` (`#431`, the bill number, the
 * supplier's name), `supplier_id`, `stage` and `payment_status` (several), the order dates
 * (inclusive), the created range; sort `order_date` (default, newest first) |
 * `purchase_order_number` | `total` | `created_at`.
 */
export const listMedicalPurchaseOrdersQueryDto = listSearchSortSchema([
  'order_date',
  'purchase_order_number',
  'total',
  'created_at',
] as const)
  .extend({
    supplier_id: recordIdSchema.optional(),
    stage: valueListSchema(MEDICAL_PURCHASE_ORDER_STAGE_VALUES).optional(),
    payment_status: valueListSchema(MEDICAL_PURCHASE_ORDER_PAYMENT_STATUS_VALUES).optional(),
    order_date_from: calendarDateSchema.optional(),
    order_date_to: calendarDateSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateMedicalPurchaseOrderDto}. */
export type CreateMedicalPurchaseOrderInput = z.infer<typeof CreateMedicalPurchaseOrderDto>;
/** Parsed {@link UpdateMedicalPurchaseOrderDto}. */
export type UpdateMedicalPurchaseOrderInput = z.infer<typeof UpdateMedicalPurchaseOrderDto>;
/** One order line as a save sends it. */
export type MedicalPurchaseOrderItemInput = z.infer<typeof medicalPurchaseOrderItemDto>;
/** Parsed {@link ReceiveMedicalPurchaseOrderDto}. */
export type ReceiveMedicalPurchaseOrderInput = z.infer<typeof ReceiveMedicalPurchaseOrderDto>;
