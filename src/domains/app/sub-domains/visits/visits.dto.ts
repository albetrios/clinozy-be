import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { VISIT_STAGE_VALUES } from './visits.constants.js';

/** Path params of the by-id `visits` routes. */
export const visitsIdParamsDto = z
  .object({
    visit_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new visit. */
export const CreateVisitDto = z
  .object({
    consult_complaint: trimmedString().max(4000).nullable().optional(),
    consult_findings: trimmedString().max(4000).nullable().optional(),
    consult_plan: trimmedString().max(4000).nullable().optional(),
    diagnoses: z.array(trimmedStringMinMax(1, 120)).max(20).optional(),
    is_safety_consent_checked: z.boolean().optional(),
    is_safety_before_photos_taken: z.boolean().optional(),
    is_safety_allergies_checked: z.boolean().optional(),
  })
  .strict();

/** Body of `PATCH /app/visits/{visit_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateVisitDto = z
  .object({
    consult_complaint: trimmedString().max(4000).nullable().optional(),
    consult_findings: trimmedString().max(4000).nullable().optional(),
    consult_plan: trimmedString().max(4000).nullable().optional(),
    diagnoses: z.array(trimmedStringMinMax(1, 120)).max(20).optional(),
    is_safety_consent_checked: z.boolean().optional(),
    is_safety_before_photos_taken: z.boolean().optional(),
    is_safety_allergies_checked: z.boolean().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `visits` list — keyset paging, `q` search, sort and filters. */
export const listVisitsQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    appointment_id: recordIdSchema.optional(),
    patient_id: recordIdSchema.optional(),
    stage: z.enum(VISIT_STAGE_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Body of `POST /app/visits/{visit_id}/stage`. */
export const stageVisitDto = z
  .object({
    stage: z.enum(VISIT_STAGE_VALUES),
  })
  .strict();

/** Parsed {@link CreateVisitDto}. */
export type CreateVisitInput = z.infer<typeof CreateVisitDto>;
/** Parsed {@link UpdateVisitDto}. */
export type UpdateVisitInput = z.infer<typeof UpdateVisitDto>;
