import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  moneySchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { OFFERING_SUGGESTION_STATUS_VALUES } from './offering-suggestions.constants.js';

/** Path params of the by-id `offering-suggestions` routes. */
export const offeringSuggestionsIdParamsDto = z
  .object({
    offering_suggestion_id: recordIdSchema,
  })
  .strict();

/** Path params of the `offering-suggestions` routes nested under their patient. */
export const offeringSuggestionsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new offering suggestion. */
export const CreateOfferingSuggestionDto = z
  .object({
    offering_id: recordIdSchema,
    quantity: z.number().int().min(1).max(99).optional(),
    price: moneySchema.nullable().optional(),
    status: z.enum(OFFERING_SUGGESTION_STATUS_VALUES).optional(),
    source_label: trimmedStringMinMax(1, 80),
    appointment_id: recordIdSchema.nullable().optional(),
    reason: trimmedStringMinMax(1, 200).nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/offering-suggestions/{offering_suggestion_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateOfferingSuggestionDto = z
  .object({
    offering_id: recordIdSchema.optional(),
    quantity: z.number().int().min(1).max(99).optional(),
    price: moneySchema.nullable().optional(),
    status: z.enum(OFFERING_SUGGESTION_STATUS_VALUES).optional(),
    source_label: trimmedStringMinMax(1, 80).optional(),
    appointment_id: recordIdSchema.nullable().optional(),
    reason: trimmedStringMinMax(1, 200).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `offering-suggestions` list — keyset paging, `q` search, sort and filters. */
export const listOfferingSuggestionsQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    status: z.enum(OFFERING_SUGGESTION_STATUS_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateOfferingSuggestionDto}. */
export type CreateOfferingSuggestionInput = z.infer<typeof CreateOfferingSuggestionDto>;
/** Parsed {@link UpdateOfferingSuggestionDto}. */
export type UpdateOfferingSuggestionInput = z.infer<typeof UpdateOfferingSuggestionDto>;
