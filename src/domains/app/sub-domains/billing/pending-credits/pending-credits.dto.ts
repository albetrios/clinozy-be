import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  moneySchema,
  paiseOf,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { invoicePaymentSplitDto } from '@/domains/app/sub-domains/billing/invoices/invoices.dto.js';
import { PAYMENT_MONEY_MODE_VALUES } from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import {
  PENDING_CREDIT_DIRECTION_VALUES,
  PENDING_CREDIT_NOTE_MAX,
  PENDING_CREDIT_SETTLE_METHOD,
  PENDING_CREDIT_SETTLE_METHOD_VALUES,
  PENDING_CREDIT_STATUS_VALUES,
} from './pending-credits.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** More than 0 rupees. */
const positiveMoneySchema = moneySchema.refine((amount) => amount > 0, {
  message: 'errors:validation.moreThanZero',
});

/** The fields a create and a change share (routes-final 8.D.8 #22). */
const pendingCreditFields = {
  direction: z.enum(PENDING_CREDIT_DIRECTION_VALUES),
  amount: positiveMoneySchema,
  reason: trimmedStringMinMax({ min: 1, max: 280 }),
  contact_id: recordIdSchema.nullable(),
  party_name: trimmedStringMinMax({ min: 1, max: 120 }).nullable(),
  invoice_id: recordIdSchema.nullable(),
  source_payment_id: recordIdSchema.nullable(),
  settle_by: calendarDateSchema.nullable(),
  note: trimmedStringMinMax({ min: 1, max: PENDING_CREDIT_NOTE_MAX }).nullable(),
};

/** Path params of the by-id pending-credit routes. */
export const pendingCreditsIdParamsDto = z
  .object({
    pending_credit_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/pending-credits` (8.D.8 #22): `direction*` (`give` · `take`), `amount*`,
 * `reason*` (1–280), and `contact_id` or `party_name`; optional `invoice_id`, `source_payment_id`,
 * `settle_by`, `note` (≤ 300).
 */
export const CreatePendingCreditDto = z
  .object({
    direction: pendingCreditFields.direction,
    amount: pendingCreditFields.amount,
    reason: pendingCreditFields.reason,
    contact_id: pendingCreditFields.contact_id.optional(),
    party_name: pendingCreditFields.party_name.optional(),
    invoice_id: pendingCreditFields.invoice_id.optional(),
    source_payment_id: pendingCreditFields.source_payment_id.optional(),
    settle_by: pendingCreditFields.settle_by.optional(),
    note: pendingCreditFields.note.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/pending-credits/{pending_credit_id}` (8.D.8 #24) — any field of the create
 * (null clears an optional one), while nothing is settled; `expected_updated_at` refuses a stale
 * save (D43).
 */
export const UpdatePendingCreditDto = z
  .object({
    direction: pendingCreditFields.direction.optional(),
    amount: pendingCreditFields.amount.optional(),
    reason: pendingCreditFields.reason.optional(),
    contact_id: pendingCreditFields.contact_id.optional(),
    party_name: pendingCreditFields.party_name.optional(),
    invoice_id: pendingCreditFields.invoice_id.optional(),
    source_payment_id: pendingCreditFields.source_payment_id.optional(),
    settle_by: pendingCreditFields.settle_by.optional(),
    note: pendingCreditFields.note.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Body of `POST /app/pending-credits/{pending_credit_id}/settle` (8.D.8 #27): `amount*` (up to
 * what is left), `method*`; `money` takes `branch_id*`, `splits*` (cash · UPI · card) and an
 * optional `paid_at`; `use_on_bill` takes `invoice_id*` (the party's, with a due).
 */
export const SettlePendingCreditDto = z
  .object({
    amount: positiveMoneySchema,
    method: z.enum(PENDING_CREDIT_SETTLE_METHOD_VALUES),
    branch_id: recordIdSchema.optional(),
    splits: z
      .array(invoicePaymentSplitDto)
      .min(1)
      .max(PAYMENT_MONEY_MODE_VALUES.length)
      .refine((splits) => distinct(splits.map((split) => split.mode)), {
        message: 'errors:validation.eachModeOnce',
      })
      .optional(),
    paid_at: instantSchema.optional(),
    invoice_id: recordIdSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const money = value.method === PENDING_CREDIT_SETTLE_METHOD.MONEY;
    const needed = money ? (['branch_id', 'splits'] as const) : (['invoice_id'] as const);
    const refused = money
      ? (['invoice_id'] as const)
      : (['branch_id', 'splits', 'paid_at'] as const);
    for (const field of needed) {
      if (value[field] === undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'errors:validation.requiredForSettleMethod',
          params: { messageParams: { method: value.method } },
        });
      }
    }
    for (const field of refused) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'errors:validation.notForSettleMethod',
          params: { messageParams: { method: value.method } },
        });
      }
    }
    if (
      money &&
      value.splits !== undefined &&
      paiseOf(value.splits.reduce((total, split) => total + split.amount, 0)) !==
        paiseOf(value.amount)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['splits'],
        message: 'errors:validation.splitsAddUpToAmount',
      });
    }
  });

/**
 * Query of the pending-credit list (8.D.8 #21): `q` (party, `CR-2`), the direction, the status
 * (several), the contact, the invoice, the settle-by range (inclusive), the created range; sort
 * `created_at` (default, newest first) | `settle_by`.
 */
export const listPendingCreditsQueryDto = listSearchSortSchema(['created_at', 'settle_by'] as const)
  .extend({
    direction: z.enum(PENDING_CREDIT_DIRECTION_VALUES).optional(),
    status: valueListSchema(PENDING_CREDIT_STATUS_VALUES).optional(),
    contact_id: recordIdSchema.optional(),
    invoice_id: recordIdSchema.optional(),
    settle_by_from: calendarDateSchema.optional(),
    settle_by_to: calendarDateSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePendingCreditDto}. */
export type CreatePendingCreditInput = z.infer<typeof CreatePendingCreditDto>;
/** Parsed {@link UpdatePendingCreditDto}. */
export type UpdatePendingCreditInput = z.infer<typeof UpdatePendingCreditDto>;
/** Parsed {@link SettlePendingCreditDto}. */
export type SettlePendingCreditInput = z.infer<typeof SettlePendingCreditDto>;
