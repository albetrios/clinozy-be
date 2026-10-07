import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  moneySchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `credit-notes` routes. */
export const creditNotesIdParamsDto = z
  .object({
    credit_note_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new credit note. */
export const CreateCreditNoteDto = z
  .object({
    invoice_id: recordIdSchema,
    amount: moneySchema,
    reason: trimmedStringMinMax(1, 280),
  })
  .strict();

/** Body of `PATCH /app/credit-notes/{credit_note_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateCreditNoteDto = z
  .object({
    invoice_id: recordIdSchema.optional(),
    amount: moneySchema.optional(),
    reason: trimmedStringMinMax(1, 280).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `credit-notes` list — keyset paging, `q` search, sort and filters. */
export const listCreditNotesQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    invoice_id: recordIdSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateCreditNoteDto}. */
export type CreateCreditNoteInput = z.infer<typeof CreateCreditNoteDto>;
/** Parsed {@link UpdateCreditNoteDto}. */
export type UpdateCreditNoteInput = z.infer<typeof UpdateCreditNoteDto>;
