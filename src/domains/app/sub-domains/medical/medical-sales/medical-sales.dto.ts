import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  moneySchema,
  percentSchema,
  recordDeleteQuerySchemaOf,
  recordIdListSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { invoicePaidNowDto } from '@/domains/app/sub-domains/billing/invoices/invoices.dto.js';
import { INVOICE_REMARK_MAX } from '@/domains/app/sub-domains/billing/invoices/invoices.constants.js';
import { MEDICINE_QUANTITY_MAX } from '@/domains/app/sub-domains/medical/medicines/medicines.constants.js';
import {
  MEDICAL_SALE_ITEMS_MAX,
  MEDICAL_SALE_MEMBERS_MAX,
  MEDICAL_SALE_REFUND_MODE_VALUES,
  MEDICAL_SALE_RETURN_REASON_VALUES,
  MEDICAL_SALE_STATUS_VALUES,
  MEDICAL_SALE_VOID_REASON_VALUES,
} from './medical-sales.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** A pack count, 1–9999. */
const packsSchema = z.number().int().min(1).max(MEDICINE_QUANTITY_MAX);

/** Path params of the by-id sale routes. */
export const medicalSalesIdParamsDto = z
  .object({
    medical_sale_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/medical-sales` (11.H.8 #46, MD19): `branch_id*` (one of yours), `contact_id*`
 * (the buyer), `items*` (1–50: `medicine_id*` — each once — `quantity*`, `discount_percent`, the
 * medicine's near-expiry discount unless sent); optional `overall_discount`, `member_ids`
 * ("Prescribed by", up to 10), `patient_prescription_id`, `remark`, `payment` ("Paid now" —
 * needs payment:create).
 */
export const CreateMedicalSaleDto = z
  .object({
    branch_id: recordIdSchema,
    contact_id: recordIdSchema,
    items: z
      .array(
        z
          .object({
            medicine_id: recordIdSchema,
            quantity: packsSchema,
            discount_percent: percentSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MEDICAL_SALE_ITEMS_MAX)
      .refine((items) => distinct(items.map((item) => item.medicine_id)), {
        message: 'Each medicine once',
      }),
    overall_discount: moneySchema.optional(),
    member_ids: z
      .array(recordIdSchema)
      .max(MEDICAL_SALE_MEMBERS_MAX)
      .refine(distinct, { message: 'Each member once' })
      .optional(),
    patient_prescription_id: recordIdSchema.optional(),
    remark: trimmedStringMinMax(1, INVOICE_REMARK_MAX).optional(),
    payment: invoicePaidNowDto.optional(),
  })
  .strict();

/**
 * Body of `POST /app/medical-sales/{medical_sale_id}/returns` (11.H.8 #50, MD21): `items*` (1–50:
 * `invoice_item_id*` — each once — `quantity*`), `reason*`, `refund_mode*`; optional `note`.
 */
export const ReturnMedicalSaleDto = z
  .object({
    items: z
      .array(
        z
          .object({
            invoice_item_id: recordIdSchema,
            quantity: packsSchema,
          })
          .strict(),
      )
      .min(1)
      .max(MEDICAL_SALE_ITEMS_MAX)
      .refine((items) => distinct(items.map((item) => item.invoice_item_id)), {
        message: 'Each line once',
      }),
    reason: z.enum(MEDICAL_SALE_RETURN_REASON_VALUES),
    refund_mode: z.enum(MEDICAL_SALE_REFUND_MODE_VALUES),
    note: trimmedStringMinMax(1, 280).optional(),
  })
  .strict();

/** The void's query — why (MD20): billed_by_mistake, wrong_items, customer_changed_mind, other. */
export const voidMedicalSaleQueryDto = recordDeleteQuerySchemaOf(MEDICAL_SALE_VOID_REASON_VALUES);

/**
 * Query of the Sales tab and its CSV (11.H.8 #44, #45): `q` (`S-983`, the buyer's name or phone, a
 * medicine's name), `status` and `branch_id` (several), `contact_id`, `medicine_id`,
 * `patient_prescription_id`; sort `sold_at` (default, newest first) | `sale_number` | `total`.
 */
export const listMedicalSalesQueryDto = listSearchSortSchema([
  'sold_at',
  'sale_number',
  'total',
] as const)
  .extend({
    status: valueListSchema(MEDICAL_SALE_STATUS_VALUES).optional(),
    contact_id: recordIdSchema.optional(),
    branch_id: recordIdListSchema.optional(),
    medicine_id: recordIdSchema.optional(),
    patient_prescription_id: recordIdSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateMedicalSaleDto}. */
export type CreateMedicalSaleInput = z.infer<typeof CreateMedicalSaleDto>;
/** Parsed {@link ReturnMedicalSaleDto}. */
export type ReturnMedicalSaleInput = z.infer<typeof ReturnMedicalSaleDto>;
