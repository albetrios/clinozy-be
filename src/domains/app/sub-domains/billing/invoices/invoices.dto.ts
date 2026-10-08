import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  moneySchema,
  recordIdListSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { PAYMENT_MONEY_MODE_VALUES } from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import {
  INVOICE_ITEM_QUANTITY_MAX,
  INVOICE_ITEMS_MAX,
  INVOICE_MEMBERS_MAX,
  INVOICE_PAYMENT_STATUS_VALUES,
  INVOICE_REMARK_MAX,
  INVOICE_TYPE_VALUES,
} from './invoices.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** A percentage with two decimals, 0–100 — a typed "Final" maps back exactly (B9). */
const percentSchema = z.number().min(0).max(100).multipleOf(0.01);

/** One invoice line as sent (8.A.8 #3, #5): an offering or a medicine, how many, the discount. */
const invoiceItemFields = {
  offering_id: recordIdSchema,
  medicine_id: recordIdSchema,
  quantity: z.number().int().min(1).max(INVOICE_ITEM_QUANTITY_MAX),
  discount_percent: percentSchema,
  patient_offering_suggestion_id: recordIdSchema.nullable(),
  // B28: the patient's done, unbilled treatments of the line's offering it pays for
  patient_treatment_ids: z
    .array(recordIdSchema)
    .max(INVOICE_ITEM_QUANTITY_MAX)
    .refine(distinct, { message: 'Each treatment once' }),
  batch_number: trimmedStringMinMax(1, 20).nullable(),
};

/** A new line: exactly one of the offering and the medicine. */
const newInvoiceItem = z
  .object({
    offering_id: invoiceItemFields.offering_id.optional(),
    medicine_id: invoiceItemFields.medicine_id.optional(),
    quantity: invoiceItemFields.quantity,
    discount_percent: invoiceItemFields.discount_percent.optional(),
    patient_offering_suggestion_id: invoiceItemFields.patient_offering_suggestion_id.optional(),
    patient_treatment_ids: invoiceItemFields.patient_treatment_ids.optional(),
    batch_number: invoiceItemFields.batch_number.optional(),
  })
  .strict()
  .refine((item) => (item.offering_id === undefined) !== (item.medicine_id === undefined), {
    message: 'Send an offering_id or a medicine_id',
  });

/** A line of a change (B12): with its `id` it is changed (the item may stay as it is), without it added. */
const changedInvoiceItem = z
  .object({
    id: recordIdSchema.optional(),
    offering_id: invoiceItemFields.offering_id.optional(),
    medicine_id: invoiceItemFields.medicine_id.optional(),
    quantity: invoiceItemFields.quantity,
    discount_percent: invoiceItemFields.discount_percent.optional(),
    patient_offering_suggestion_id: invoiceItemFields.patient_offering_suggestion_id.optional(),
    patient_treatment_ids: invoiceItemFields.patient_treatment_ids.optional(),
    batch_number: invoiceItemFields.batch_number.optional(),
  })
  .strict()
  .refine(
    (item) =>
      item.id === undefined
        ? (item.offering_id === undefined) !== (item.medicine_id === undefined)
        : !(item.offering_id !== undefined && item.medicine_id !== undefined),
    { message: 'Send an offering_id or a medicine_id' },
  );

/** One split of money (B18) — cash, UPI or card. */
export const invoicePaymentSplitDto = z
  .object({
    mode: z.enum(PAYMENT_MONEY_MODE_VALUES),
    amount: moneySchema.refine((amount) => amount > 0, { message: 'More than 0' }),
  })
  .strict();

/** The drawer's "Paid now" (B13): the receipt recorded with the bill, up to its total. */
export const invoicePaidNowDto = z
  .object({
    splits: z
      .array(invoicePaymentSplitDto)
      .min(1)
      .max(PAYMENT_MONEY_MODE_VALUES.length)
      .refine((splits) => distinct(splits.map((split) => split.mode)), {
        message: 'Each mode once',
      }),
    paid_at: instantSchema.optional(),
    reference: trimmedStringMinMax(1, 60).nullable().optional(),
  })
  .strict();

/** The header fields both writes share. */
const invoiceFields = {
  contact_id: recordIdSchema.nullable(),
  invoice_date: calendarDateSchema,
  member_ids: z
    .array(recordIdSchema)
    .max(INVOICE_MEMBERS_MAX)
    .refine(distinct, { message: 'Each member once' }),
  overall_discount: moneySchema,
  remark: trimmedStringMinMax(1, INVOICE_REMARK_MAX).nullable(),
  patient_prescription_id: recordIdSchema.nullable(),
};

/** Path params of the by-id `invoices` routes. */
export const invoicesIdParamsDto = z
  .object({
    invoice_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/invoices` (routes-final 8.A.8 #3): `branch_id*` (one of yours), `items*`
 * (1–50: an offering or a medicine, `quantity*`, a `discount_percent`, the plan row, the treatments
 * it bills), `contact_id` (required except `medical`), the type, date, team, overall discount,
 * remark, prescription — and `payment`, the drawer's "Paid now".
 */
export const CreateInvoiceDto = z
  .object({
    branch_id: recordIdSchema,
    items: z.array(newInvoiceItem).min(1).max(INVOICE_ITEMS_MAX),
    contact_id: invoiceFields.contact_id.optional(),
    type: z.enum(INVOICE_TYPE_VALUES).optional(),
    invoice_date: invoiceFields.invoice_date.optional(),
    member_ids: invoiceFields.member_ids.optional(),
    overall_discount: invoiceFields.overall_discount.optional(),
    remark: invoiceFields.remark.optional(),
    patient_prescription_id: invoiceFields.patient_prescription_id.optional(),
    payment: invoicePaidNowDto.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/invoices/{invoice_id}` (8.A.8 #5): the contact (nothing paid yet), the date
 * (same financial year), the lines by `id` (B12), the team, the overall discount, the remark, the
 * prescription (at least one); `expected_updated_at` refuses a stale save (D43). The branch and
 * the type never change.
 */
export const UpdateInvoiceDto = z
  .object({
    contact_id: invoiceFields.contact_id.optional(),
    invoice_date: invoiceFields.invoice_date.optional(),
    items: z
      .array(changedInvoiceItem)
      .min(1)
      .max(INVOICE_ITEMS_MAX)
      .refine((items) => distinct(items.flatMap((item) => (item.id ? [item.id] : []))), {
        message: 'Each line once',
      })
      .optional(),
    member_ids: invoiceFields.member_ids.optional(),
    overall_discount: invoiceFields.overall_discount.optional(),
    remark: invoiceFields.remark.optional(),
    patient_prescription_id: invoiceFields.patient_prescription_id.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of the invoice list and its export (8.A.8 #1, #2): `q` (`#1042` or `2026-27/0412`), the
 * type and branch (several), the contact, the patient, a credited member, the payment status
 * (several), the date range (inclusive), the created range; sort `invoice_date` (default, newest
 * first) | `created_at` | `due_amount`.
 */
export const listInvoicesQueryDto = listSearchSortSchema([
  'invoice_date',
  'created_at',
  'due_amount',
] as const)
  .extend({
    type: valueListSchema(INVOICE_TYPE_VALUES).optional(),
    branch_id: recordIdListSchema.optional(),
    contact_id: recordIdSchema.optional(),
    patient_id: recordIdSchema.optional(),
    member_id: recordIdSchema.optional(),
    payment_status: valueListSchema(INVOICE_PAYMENT_STATUS_VALUES).optional(),
    invoice_date_from: calendarDateSchema.optional(),
    invoice_date_to: calendarDateSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateInvoiceDto}. */
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceDto>;
/** Parsed {@link UpdateInvoiceDto}. */
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceDto>;
/** One line as a create or a change sends it. */
export type InvoiceItemInput = z.infer<typeof changedInvoiceItem>;
/** The "Paid now" of a create. */
export type InvoicePaidNowInput = z.infer<typeof invoicePaidNowDto>;
