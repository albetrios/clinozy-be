import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  httpsLinkSchema,
  instantSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PATIENT_REVIEW_FILE_KEYS_MAX,
  PATIENT_REVIEW_SOURCE_VALUES,
  PATIENT_REVIEW_TEXT_MAX,
} from './patient-reviews.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** The fields a review is written with (7.J.8 #58, #60) — each optional; create and update narrow them. */
const reviewFields = {
  source: z.enum(PATIENT_REVIEW_SOURCE_VALUES),
  review_date: calendarDateSchema,
  rating: z.number().int().min(1).max(5).nullable(),
  text: trimmedStringMinMax({ min: 1, max: PATIENT_REVIEW_TEXT_MAX }).nullable(),
  link: httpsLinkSchema(500).nullable(),
  file_keys: z
    .array(trimmedStringMinMax({ min: 1, max: 512 }))
    .max(PATIENT_REVIEW_FILE_KEYS_MAX)
    .refine(distinct, { message: 'errors:validation.eachFileOnce' }),
  appointment_id: recordIdSchema.nullable(),
};

/** Path params of the by-id `patient-reviews` routes (nested under the patient). */
export const patientReviewsIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
    patient_review_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-reviews` routes nested under their patient. */
export const patientReviewsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/patients/{patient_id}/reviews` (routes-final 7.J.8 #58): `source*`;
 * `review_date` (default today), `rating` (1–5), `text` (≤ 2,000), `link` (`https://` only, TR11),
 * `file_keys` (up to 10 confirmed uploads), `appointment_id`.
 */
export const CreatePatientReviewDto = z
  .object({
    source: reviewFields.source,
    review_date: reviewFields.review_date.optional(),
    rating: reviewFields.rating.optional(),
    text: reviewFields.text.optional(),
    link: reviewFields.link.optional(),
    file_keys: reviewFields.file_keys.optional(),
    appointment_id: reviewFields.appointment_id.optional(),
  })
  .strict();

/**
 * Body of `PATCH …/reviews/{patient_review_id}` (7.J.8 #60): any field of the create (at least
 * one; null clears an optional one); `expected_updated_at` refuses a stale save (D43).
 */
export const UpdatePatientReviewDto = z
  .object({
    source: reviewFields.source.optional(),
    review_date: reviewFields.review_date.optional(),
    rating: reviewFields.rating.optional(),
    text: reviewFields.text.optional(),
    link: reviewFields.link.optional(),
    file_keys: reviewFields.file_keys.optional(),
    appointment_id: reviewFields.appointment_id.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Query of a patient's reviews (7.J.8 #57): `source` (several), `needs_action`, the date range
 * (inclusive), the created range; sort `review_date` (default, newest first) | `created_at`.
 */
export const listPatientReviewsQueryDto = listSearchSortSchema([
  'review_date',
  'created_at',
] as const)
  .omit({ q: true })
  .extend({
    source: valueListSchema(PATIENT_REVIEW_SOURCE_VALUES).optional(),
    needs_action: z.enum(['true', 'false']).optional(),
    review_date_from: calendarDateSchema.optional(),
    review_date_to: calendarDateSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePatientReviewDto}. */
export type CreatePatientReviewInput = z.infer<typeof CreatePatientReviewDto>;
/** Parsed {@link UpdatePatientReviewDto}. */
export type UpdatePatientReviewInput = z.infer<typeof UpdatePatientReviewDto>;
