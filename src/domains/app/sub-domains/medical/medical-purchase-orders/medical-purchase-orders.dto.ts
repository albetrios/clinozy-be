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
  yearMonthSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  MEDICINE_GST_PERCENT_VALUES,
  MEDICINE_QUANTITY_MAX,
} from '@/domains/app/sub-domains/medical/medicines/medicines.constants.js';
import {
  expiryMonthSchema,
  printedMrpSchema,
} from '@/domains/app/sub-domains/medical/medicines/medicines.dto.js';
import {
  MEDICAL_PURCHASE_ORDER_CANCEL_REASON_VALUES,
  MEDICAL_PURCHASE_ORDER_ITEMS_MAX,
  MEDICAL_PURCHASE_ORDER_PAYMENT_STATUS_VALUES,
  MEDICAL_PURCHASE_ORDER_STAGE_VALUES,
} from './medical-purchase-orders.constants.js';

/** What the desk notes on an order ("30 DAYS DUE", "without gst bill"). */
const noteSchema = trimmedStringMinMax({ min: 1, max: 500 });

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** An order line's fields (MD15) — an ordered line's and, on receive, a line not ordered's. */
const medicalPurchaseOrderItemFields = z.object({
  medicine_id: recordIdSchema.optional(),
  new_medicine_name: trimmedStringMinMax({ min: 1, max: 120 }).optional(),
  quantity: z.number().int().min(1).max(MEDICINE_QUANTITY_MAX),
  free_quantity: z.number().int().min(0).max(MEDICINE_QUANTITY_MAX).optional(),
  rate: moneySchema.refine((rate) => rate > 0, { message: 'errors:validation.moreThanZero' }),
  mrp: printedMrpSchema.nullable().optional(),
  gst_percent: z.literal(MEDICINE_GST_PERCENT_VALUES).optional(),
  is_gst_inclusive: z.boolean().optional(),
});

/** Exactly one of `medicine_id` and `new_medicine_name` names a line's medicine. */
const oneMedicine = (item: {
  medicine_id?: string | undefined;
  new_medicine_name?: string | undefined;
}) => (item.medicine_id === undefined) !== (item.new_medicine_name === undefined);

/**
 * One order line (MD15): a medicine — or `new_medicine_name`, a quick one added as typed —
 * `quantity*` (1–9999 packs), `free_quantity`, `rate*` (a pack's, above 0), `mrp` (printed on
 * the packs), `gst_percent` (0, 5, 12, 18, 28 — the medicine's unless sent) and
 * `is_gst_inclusive` (the rate includes GST — yes unless sent, PG5).
 */
const medicalPurchaseOrderItemDto = medicalPurchaseOrderItemFields
  .strict()
  .refine(oneMedicine, { message: 'errors:validation.medicineIdOrNewMedicineName' });

/**
 * How an ordered line arrived (MD16): ticked (default) or not, its batch number, expiry and the
 * MRP printed on it (the order line's unless sent).
 */
const receivedOrderedLineDto = z
  .object({
    id: recordIdSchema,
    is_received: z.boolean().optional(),
    batch_number: trimmedStringMinMax({ min: 1, max: 20 }).optional(),
    expiry_month: expiryMonthSchema.optional(),
    mrp: printedMrpSchema.nullable().optional(),
  })
  .strict();

/**
 * Goods that came but were not ordered (MD26, "+ Add unexpected item"): a line without `id` — the
 * medicine (or `new_medicine_name`), `quantity*`, `free_quantity`, `rate*`, its batch and expiry.
 */
const receivedNewLineDto = medicalPurchaseOrderItemFields
  .extend({
    batch_number: trimmedStringMinMax({ min: 1, max: 20 }).optional(),
    expiry_month: expiryMonthSchema.optional(),
  })
  .strict()
  .refine(oneMedicine, { message: 'errors:validation.medicineIdOrNewMedicineName' });

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
 * `supplier_bill_number`, `note`, `order_date` (today unless sent, never after it).
 */
export const CreateMedicalPurchaseOrderDto = z
  .object({
    supplier_id: recordIdSchema,
    items: itemsSchema,
    supplier_bill_number: supplierBillNumberSchema.optional(),
    note: noteSchema.optional(),
    order_date: calendarDateSchema.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/medical-purchase-orders/{medical_purchase_order_id}` (11.E.8 #29) — an order
 * not yet received: `supplier_id`, `supplier_bill_number` (null clears it), `note` (null clears
 * it — the one field a received order still changes), `order_date`, `items` (the whole list);
 * `expected_updated_at` refuses a stale save.
 */
export const UpdateMedicalPurchaseOrderDto = z
  .object({
    supplier_id: recordIdSchema.optional(),
    supplier_bill_number: supplierBillNumberSchema.nullable().optional(),
    note: noteSchema.nullable().optional(),
    order_date: calendarDateSchema.optional(),
    items: itemsSchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Body of `POST …/{medical_purchase_order_id}/receive` (11.E.8 #32, MD16, MD26): optional `items` —
 * an ordered line (`id*`, `is_received` — default yes — `batch_number`, `expiry_month`, `mrp`) or
 * goods not ordered (no `id`: the medicine or `new_medicine_name`, `quantity*`, `free_quantity`,
 * `rate*`, `mrp`, `batch_number`, `expiry_month`) — `supplier_bill_number` and `note`.
 */
export const ReceiveMedicalPurchaseOrderDto = z
  .object({
    items: z
      .array(z.union([receivedOrderedLineDto, receivedNewLineDto]))
      .max(MEDICAL_PURCHASE_ORDER_ITEMS_MAX)
      .refine((items) => distinct(items.flatMap((item) => ('id' in item ? [item.id] : []))), {
        message: 'errors:validation.eachLineOnce',
      })
      .optional(),
    supplier_bill_number: supplierBillNumberSchema.optional(),
    note: noteSchema.optional(),
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

/** Query of the purchase GST summary and its CSV (PG9): `month*` as `YYYY-MM`. */
export const medicalPurchaseGstSummaryQueryDto = z.object({ month: yearMonthSchema }).strict();

/** Parsed {@link CreateMedicalPurchaseOrderDto}. */
export type CreateMedicalPurchaseOrderInput = z.infer<typeof CreateMedicalPurchaseOrderDto>;
/** Parsed {@link UpdateMedicalPurchaseOrderDto}. */
export type UpdateMedicalPurchaseOrderInput = z.infer<typeof UpdateMedicalPurchaseOrderDto>;
/** One order line as a save sends it. */
export type MedicalPurchaseOrderItemInput = z.infer<typeof medicalPurchaseOrderItemDto>;
/** Parsed {@link ReceiveMedicalPurchaseOrderDto}. */
export type ReceiveMedicalPurchaseOrderInput = z.infer<typeof ReceiveMedicalPurchaseOrderDto>;
