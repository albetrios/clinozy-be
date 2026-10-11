import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  MEDICAL_REP_VISIT_NOTES_MAX,
  MEDICAL_REP_VISIT_SAMPLES_MAX,
} from './medical-rep-visits.constants.js';

/** Path params of the visit routes nested under their MR. */
export const medicalRepVisitsParentParamsDto = z
  .object({
    medical_rep_id: recordIdSchema,
  })
  .strict();

/** Path params of the by-id visit routes. */
export const medicalRepVisitsIdParamsDto = z
  .object({
    medical_rep_id: recordIdSchema,
    medical_rep_visit_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/medical-reps/{medical_rep_id}/visits` (11.G.8 #40) — all optional:
 * `visit_date` (today unless sent, never after it), `next_visit_on` (after the visit, at most 120
 * days on), `samples`, `notes`.
 */
export const CreateMedicalRepVisitDto = z
  .object({
    visit_date: calendarDateSchema.optional(),
    next_visit_on: calendarDateSchema.optional(),
    samples: trimmedStringMinMax({ min: 1, max: MEDICAL_REP_VISIT_SAMPLES_MAX }).optional(),
    notes: trimmedStringMinMax({ min: 1, max: MEDICAL_REP_VISIT_NOTES_MAX }).optional(),
  })
  .strict();

/** Query of an MR's visits (11.G.8 #39): sort `visit_date` (default, newest first) | `created_at`. */
export const listMedicalRepVisitsQueryDto = listSearchSortSchema([
  'visit_date',
  'created_at',
] as const)
  .omit({ q: true })
  .strict();

/** Parsed {@link CreateMedicalRepVisitDto}. */
export type CreateMedicalRepVisitInput = z.infer<typeof CreateMedicalRepVisitDto>;
