import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  moneySchema,
  recordIdListSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PAYMENT_DIRECTION_VALUES,
  PAYMENT_KIND_VALUES,
  PAYMENT_EXPENSE_CATEGORY_VALUES,
} from './payments.constants.js';

/** Path params of the by-id `payments` routes. */
export const paymentsIdParamsDto = z
  .object({
    payment_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new payment. */
export const CreatePaymentDto = z
  .object({
    direction: z.enum(PAYMENT_DIRECTION_VALUES),
    kind: z.enum(PAYMENT_KIND_VALUES),
    branch_id: recordIdSchema,
    amount: moneySchema,
    splits: z
      .array(
        z.object({ mode: z.enum(['cash', 'upi', 'card', 'credit']), amount: moneySchema }).strict(),
      )
      .min(1)
      .max(4)
      .optional(),
    patient_id: recordIdSchema.nullable().optional(),
    invoice_id: recordIdSchema.nullable().optional(),
    payee_name: trimmedStringMinMax(1, 120).nullable().optional(),
    expense_category: z.enum(PAYMENT_EXPENSE_CATEGORY_VALUES).nullable().optional(),
    bill_ref: z
      .object({
        kind: z.enum(['medical_po', 'stock_po', 'other']),
        purchase_id: recordIdSchema,
        bill_number: trimmedStringMinMax(1, 30),
      })
      .strict()
      .nullable()
      .optional(),
    pending_credit_id: recordIdSchema.nullable().optional(),
    note: trimmedStringMinMax(1, 280).nullable().optional(),
    paid_at: instantSchema.optional(),
    bill_allocations: z
      .array(z.object({ purchase_id: recordIdSchema, amount: moneySchema }).strict())
      .max(20)
      .optional(),
    reference: trimmedStringMinMax(1, 60).nullable().optional(),
    attachment_keys: z.array(trimmedStringMinMax(1, 512)).max(5).optional(),
  })
  .strict();

/** Body of `PATCH /app/payments/{payment_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePaymentDto = z
  .object({
    direction: z.enum(PAYMENT_DIRECTION_VALUES).optional(),
    kind: z.enum(PAYMENT_KIND_VALUES).optional(),
    branch_id: recordIdSchema.optional(),
    amount: moneySchema.optional(),
    splits: z
      .array(
        z.object({ mode: z.enum(['cash', 'upi', 'card', 'credit']), amount: moneySchema }).strict(),
      )
      .min(1)
      .max(4)
      .optional(),
    patient_id: recordIdSchema.nullable().optional(),
    invoice_id: recordIdSchema.nullable().optional(),
    payee_name: trimmedStringMinMax(1, 120).nullable().optional(),
    expense_category: z.enum(PAYMENT_EXPENSE_CATEGORY_VALUES).nullable().optional(),
    bill_ref: z
      .object({
        kind: z.enum(['medical_po', 'stock_po', 'other']),
        purchase_id: recordIdSchema,
        bill_number: trimmedStringMinMax(1, 30),
      })
      .strict()
      .nullable()
      .optional(),
    pending_credit_id: recordIdSchema.nullable().optional(),
    note: trimmedStringMinMax(1, 280).nullable().optional(),
    paid_at: instantSchema.optional(),
    bill_allocations: z
      .array(z.object({ purchase_id: recordIdSchema, amount: moneySchema }).strict())
      .max(20)
      .optional(),
    reference: trimmedStringMinMax(1, 60).nullable().optional(),
    attachment_keys: z.array(trimmedStringMinMax(1, 512)).max(5).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `payments` list — keyset paging, `q` search, sort and filters. */
export const listPaymentsQueryDto = listSearchSortSchema(['created_at', 'paid_at'] as const)
  .extend({
    direction: z.enum(PAYMENT_DIRECTION_VALUES).optional(),
    kind: z.enum(PAYMENT_KIND_VALUES).optional(),
    branch_id: recordIdSchema.optional(),
    patient_id: recordIdSchema.optional(),
    invoice_id: recordIdSchema.optional(),
    expense_category: z.enum(PAYMENT_EXPENSE_CATEGORY_VALUES).optional(),
    paid_at_from: z.iso.datetime({ offset: true }).optional(),
    paid_at_to: z.iso.datetime({ offset: true }).optional(),
    day_close_id: recordIdSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
    branch_ids: recordIdListSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePaymentDto}. */
export type CreatePaymentInput = z.infer<typeof CreatePaymentDto>;
/** Parsed {@link UpdatePaymentDto}. */
export type UpdatePaymentInput = z.infer<typeof UpdatePaymentDto>;
