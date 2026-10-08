import { z } from 'zod';
import { cursorPaginationSchema } from '@/shared/utils/http/pagination.util.js';
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
import {
  PAYMENT_ATTACHMENT_KEYS_MAX,
  PAYMENT_CREATE_KIND_VALUES,
  PAYMENT_DIRECTION_VALUES,
  PAYMENT_EXPENSE_CATEGORY_VALUES,
  PAYMENT_KIND_VALUES,
  PAYMENT_MODE,
  PAYMENT_MODE_VALUES,
} from './payments.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** One split (B18): a mode and more than 0. */
const paymentSplitDto = z
  .object({
    mode: z.enum(PAYMENT_MODE_VALUES),
    amount: moneySchema.refine((amount) => amount > 0, { message: 'More than 0' }),
  })
  .strict();

/** 1–4 splits, each mode once (B18) — `amount` is their total. */
const splitsSchema = z
  .array(paymentSplitDto)
  .min(1)
  .max(PAYMENT_MODE_VALUES.length)
  .refine((splits) => distinct(splits.map((split) => split.mode)), { message: 'Each mode once' });

/** Money splits only — `credit` is a pending credit used on a bill (8.D route 27). */
const moneySplitsSchema = splitsSchema.refine(
  (splits) => splits.every((split) => split.mode !== PAYMENT_MODE.CREDIT),
  { message: 'Credit only through a pending credit' },
);

/** Up to five upload keys, each once — confirmed uploads of the organization. */
const attachmentKeysSchema = z
  .array(trimmedStringMinMax(1, 512))
  .max(PAYMENT_ATTACHMENT_KEYS_MAX)
  .refine(distinct, { message: 'Each attachment once' });

/** The fields a create and a change share. */
const paymentFields = {
  paid_at: instantSchema,
  contact_id: recordIdSchema.nullable(),
  invoice_id: recordIdSchema.nullable(),
  stock_purchase_id: recordIdSchema.nullable(),
  payee_name: trimmedStringMinMax(1, 120).nullable(),
  expense_category: z.enum(PAYMENT_EXPENSE_CATEGORY_VALUES).nullable(),
  reference: trimmedStringMinMax(1, 60).nullable(),
  note: trimmedStringMinMax(1, 280).nullable(),
  attachment_keys: attachmentKeysSchema,
};

/** Path params of the by-id payment routes. */
export const paymentsIdParamsDto = z
  .object({
    payment_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/payments` (routes-final 8.C.8 #14): `kind*` (`receipt` · `money_back` ·
 * `expense` · `supplier_bill` — refunds and reversals have their own routes), `branch_id*`,
 * `splits*` (money modes); optional `paid_at` (an open day), `contact_id` (a receipt's),
 * `invoice_id` (a receipt's), `stock_purchase_id` (a supplier bill's — launch #137, S11),
 * `payee_name`, `expense_category`, `reference`, `note`, `attachment_keys`.
 */
export const CreatePaymentDto = z
  .object({
    kind: z.enum(PAYMENT_CREATE_KIND_VALUES),
    branch_id: recordIdSchema,
    splits: moneySplitsSchema,
    paid_at: paymentFields.paid_at.optional(),
    contact_id: paymentFields.contact_id.optional(),
    invoice_id: paymentFields.invoice_id.optional(),
    stock_purchase_id: paymentFields.stock_purchase_id.optional(),
    payee_name: paymentFields.payee_name.optional(),
    expense_category: paymentFields.expense_category.optional(),
    reference: paymentFields.reference.optional(),
    note: paymentFields.note.optional(),
    attachment_keys: paymentFields.attachment_keys.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/payments/{payment_id}` (8.C.8 #16) — on an open day only: any of the splits,
 * `paid_at`, `contact_id`, `invoice_id`, `stock_purchase_id`, `payee_name`, `expense_category`,
 * `reference`, `note`, `attachment_keys` (null clears an optional one); `expected_updated_at` refuses a stale save. The
 * kind, direction and branch never change (B20).
 */
export const UpdatePaymentDto = z
  .object({
    splits: splitsSchema.optional(),
    paid_at: paymentFields.paid_at.optional(),
    contact_id: paymentFields.contact_id.optional(),
    invoice_id: paymentFields.invoice_id.optional(),
    stock_purchase_id: paymentFields.stock_purchase_id.optional(),
    payee_name: paymentFields.payee_name.optional(),
    expense_category: paymentFields.expense_category.optional(),
    reference: paymentFields.reference.optional(),
    note: paymentFields.note.optional(),
    attachment_keys: paymentFields.attachment_keys.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Body of `POST /app/payments/{payment_id}/reverse` (8.C.8 #18): why, and the reversal's day. */
export const ReversePaymentDto = z
  .object({
    reason: trimmedStringMinMax(1, 280),
    paid_at: instantSchema.optional(),
  })
  .strict();

/** Query of `GET /app/payments/{payment_id}/edits` (8.C.8 #17): the page. */
export const listPaymentEditsQueryDto = cursorPaginationSchema.strict();

/**
 * Query of the ledger and its export (8.C.8 #12, #13): `q` (payee, `PAY-12`), the direction, kind,
 * mode, branch and category (several), the contact, patient, invoice, pending credit and stock
 * purchase, the paid days (inclusive), `is_settled`, the created range; sort `paid_at` (default,
 * newest first) | `created_at` | `amount`.
 */
export const listPaymentsQueryDto = listSearchSortSchema([
  'paid_at',
  'created_at',
  'amount',
] as const)
  .extend({
    direction: z.enum(PAYMENT_DIRECTION_VALUES).optional(),
    kind: valueListSchema(PAYMENT_KIND_VALUES).optional(),
    mode: valueListSchema(PAYMENT_MODE_VALUES).optional(),
    branch_id: recordIdListSchema.optional(),
    contact_id: recordIdSchema.optional(),
    patient_id: recordIdSchema.optional(),
    invoice_id: recordIdSchema.optional(),
    pending_credit_id: recordIdSchema.optional(),
    stock_purchase_id: recordIdSchema.optional(),
    expense_category: valueListSchema(PAYMENT_EXPENSE_CATEGORY_VALUES).optional(),
    paid_date_from: calendarDateSchema.optional(),
    paid_date_to: calendarDateSchema.optional(),
    is_settled: z.enum(['true', 'false']).optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePaymentDto}. */
export type CreatePaymentInput = z.infer<typeof CreatePaymentDto>;
/** Parsed {@link UpdatePaymentDto}. */
export type UpdatePaymentInput = z.infer<typeof UpdatePaymentDto>;
/** Parsed {@link ReversePaymentDto}. */
export type ReversePaymentInput = z.infer<typeof ReversePaymentDto>;
