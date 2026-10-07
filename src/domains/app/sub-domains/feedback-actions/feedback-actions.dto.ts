import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { FEEDBACK_ACTION_ACTION_VALUES } from './feedback-actions.constants.js';

/** Path params of the by-id `feedback-actions` routes. */
export const feedbackActionsIdParamsDto = z
  .object({
    feedback_action_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new feedback action. */
export const CreateFeedbackActionDto = z
  .object({
    check_in_id: recordIdSchema.nullable().optional(),
    review_id: recordIdSchema.nullable().optional(),
    action: z.enum(FEEDBACK_ACTION_ACTION_VALUES),
    note: trimmedStringMinMax(1, 280).nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/feedback-actions/{feedback_action_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateFeedbackActionDto = z
  .object({
    check_in_id: recordIdSchema.nullable().optional(),
    review_id: recordIdSchema.nullable().optional(),
    action: z.enum(FEEDBACK_ACTION_ACTION_VALUES).optional(),
    note: trimmedStringMinMax(1, 280).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `feedback-actions` list — keyset paging, `q` search, sort and filters. */
export const listFeedbackActionsQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    check_in_id: recordIdSchema.optional(),
    review_id: recordIdSchema.optional(),
    action: z.enum(FEEDBACK_ACTION_ACTION_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateFeedbackActionDto}. */
export type CreateFeedbackActionInput = z.infer<typeof CreateFeedbackActionDto>;
/** Parsed {@link UpdateFeedbackActionDto}. */
export type UpdateFeedbackActionInput = z.infer<typeof UpdateFeedbackActionDto>;
