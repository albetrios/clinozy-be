import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { REVIEW_SOURCE_VALUES } from './reviews.constants.js';

/** Path params of the by-id `reviews` routes. */
export const reviewsIdParamsDto = z
  .object({
    review_id: recordIdSchema,
  })
  .strict();

/** Path params of the `reviews` routes nested under their patient. */
export const reviewsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new review. */
export const CreateReviewDto = z
  .object({
    appointment_id: recordIdSchema.nullable().optional(),
    source: z.enum(REVIEW_SOURCE_VALUES),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    text: trimmedString().max(2000).nullable().optional(),
    link: trimmedStringMinMax(1, 500).nullable().optional(),
    file_keys: z.array(trimmedStringMinMax(1, 512)).max(10).optional(),
    review_date: calendarDateSchema,
  })
  .strict();

/** Body of `PATCH /app/reviews/{review_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateReviewDto = z
  .object({
    appointment_id: recordIdSchema.nullable().optional(),
    source: z.enum(REVIEW_SOURCE_VALUES).optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    text: trimmedString().max(2000).nullable().optional(),
    link: trimmedStringMinMax(1, 500).nullable().optional(),
    file_keys: z.array(trimmedStringMinMax(1, 512)).max(10).optional(),
    review_date: calendarDateSchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `reviews` list — keyset paging, `q` search, sort and filters. */
export const listReviewsQueryDto = listSearchSortSchema(['created_at', 'review_date'] as const)
  .extend({
    source: z.enum(REVIEW_SOURCE_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateReviewDto}. */
export type CreateReviewInput = z.infer<typeof CreateReviewDto>;
/** Parsed {@link UpdateReviewDto}. */
export type UpdateReviewInput = z.infer<typeof UpdateReviewDto>;
