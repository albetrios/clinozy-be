import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  moneySchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PENDING_CREDIT_DIRECTION_VALUES,
  PENDING_CREDIT_PARTY_KIND_VALUES,
  PENDING_CREDIT_STATUS_VALUES,
} from './pending-credits.constants.js';

/** Path params of the by-id `pending-credits` routes. */
export const pendingCreditsIdParamsDto = z
  .object({
    pending_credit_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new pending credit. */
export const CreatePendingCreditDto = z
  .object({
    direction: z.enum(PENDING_CREDIT_DIRECTION_VALUES),
    party_kind: z.enum(PENDING_CREDIT_PARTY_KIND_VALUES).optional(),
    party_name: trimmedStringMinMax(1, 120),
    patient_id: recordIdSchema.nullable().optional(),
    amount: moneySchema,
    reason: trimmedStringMinMax(1, 280),
    source_payment_id: recordIdSchema.nullable().optional(),
    invoice_id: recordIdSchema.nullable().optional(),
    settle_by: calendarDateSchema.nullable().optional(),
    note: trimmedStringMinMax(1, 280).nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/pending-credits/{pending_credit_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePendingCreditDto = z
  .object({
    direction: z.enum(PENDING_CREDIT_DIRECTION_VALUES).optional(),
    party_kind: z.enum(PENDING_CREDIT_PARTY_KIND_VALUES).optional(),
    party_name: trimmedStringMinMax(1, 120).optional(),
    patient_id: recordIdSchema.nullable().optional(),
    amount: moneySchema.optional(),
    reason: trimmedStringMinMax(1, 280).optional(),
    source_payment_id: recordIdSchema.nullable().optional(),
    invoice_id: recordIdSchema.nullable().optional(),
    settle_by: calendarDateSchema.nullable().optional(),
    note: trimmedStringMinMax(1, 280).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `pending-credits` list — keyset paging, `q` search, sort and filters. */
export const listPendingCreditsQueryDto = listSearchSortSchema(['created_at', 'settle_by'] as const)
  .extend({
    direction: z.enum(PENDING_CREDIT_DIRECTION_VALUES).optional(),
    party_kind: z.enum(PENDING_CREDIT_PARTY_KIND_VALUES).optional(),
    patient_id: recordIdSchema.optional(),
    status: z.enum(PENDING_CREDIT_STATUS_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreatePendingCreditDto}. */
export type CreatePendingCreditInput = z.infer<typeof CreatePendingCreditDto>;
/** Parsed {@link UpdatePendingCreditDto}. */
export type UpdatePendingCreditInput = z.infer<typeof UpdatePendingCreditDto>;
