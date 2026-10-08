import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  instantSchema,
  moneySchema,
  recordIdListSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { invoicePaymentSplitDto } from '@/domains/app/sub-domains/billing/invoices/invoices.dto.js';
import { PAYMENT_MONEY_MODE_VALUES } from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import { INVOICE_CREDIT_NOTE_REASON_MAX } from './invoice-credit-notes.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the credit notes nested under their invoice. */
export const invoiceCreditNotesParentParamsDto = z
  .object({
    invoice_id: recordIdSchema,
  })
  .strict();

/** Path params of one credit note. */
export const invoiceCreditNotesIdParamsDto = z
  .object({
    invoice_id: recordIdSchema,
    invoice_credit_note_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/invoices/{invoice_id}/credit-notes` (routes-final 8.B.8 #10): `amount*` (up to
 * what is paid), `reason*` (1–280), `splits*` (how the money goes back — cash, UPI, card — adding
 * up to `amount`); optional `paid_at` (an open day), `reference`, `note` — the refund payment's.
 */
export const CreateInvoiceCreditNoteDto = z
  .object({
    amount: moneySchema.refine((amount) => amount > 0, { message: 'More than 0' }),
    reason: trimmedStringMinMax(1, INVOICE_CREDIT_NOTE_REASON_MAX),
    splits: z
      .array(invoicePaymentSplitDto)
      .min(1)
      .max(PAYMENT_MONEY_MODE_VALUES.length)
      .refine((splits) => distinct(splits.map((split) => split.mode)), {
        message: 'Each mode once',
      }),
    paid_at: instantSchema.optional(),
    reference: trimmedStringMinMax(1, 60).nullable().optional(),
    note: trimmedStringMinMax(1, 280).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      Math.round(value.splits.reduce((total, split) => total + split.amount, 0) * 100) ===
      Math.round(value.amount * 100),
    { path: ['splits'], message: 'The splits add up to the amount' },
  );

/**
 * Query of the credit-note lists (8.B.8 #8, #9): `q` (`CN-12`), the invoice, its contact and branch
 * (several), the created range; sort `created_at` (default, newest first).
 */
export const listInvoiceCreditNotesQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    invoice_id: recordIdSchema.optional(),
    contact_id: recordIdSchema.optional(),
    branch_id: recordIdListSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Query of an invoice's credit notes (8.B.8 #9): the sort and the page. */
export const listInvoiceCreditNotesNestedQueryDto = listSearchSortSchema([
  'created_at',
] as const).omit({ q: true });

/** The list query plus the caller's branches — set by the service, never sent (B4). */
export const listInvoiceCreditNotesInternalQueryDto = listInvoiceCreditNotesQueryDto
  .extend({ visible_branch_ids: z.array(z.number().int()).optional() })
  .strict();

/** Parsed {@link CreateInvoiceCreditNoteDto}. */
export type CreateInvoiceCreditNoteInput = z.infer<typeof CreateInvoiceCreditNoteDto>;
