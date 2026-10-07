import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `medical-rep-visits` routes. */
export const medicalRepVisitsIdParamsDto = z
  .object({
    medical_rep_visit_id: recordIdSchema,
  })
  .strict();

/** Path params of the `medical-rep-visits` routes nested under their medical rep. */
export const medicalRepVisitsParentParamsDto = z
  .object({
    medical_rep_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new medical rep visit. */
export const CreateMedicalRepVisitDto = z
  .object({
    visit_date: calendarDateSchema,
    samples: trimmedStringMinMax(1, 120).nullable().optional(),
    notes: trimmedString().max(500).nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/medical-rep-visits/{medical_rep_visit_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateMedicalRepVisitDto = z
  .object({
    visit_date: calendarDateSchema.optional(),
    samples: trimmedStringMinMax(1, 120).nullable().optional(),
    notes: trimmedString().max(500).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `medical-rep-visits` list — keyset paging, `q` search, sort and filters. */
export const listMedicalRepVisitsQueryDto = listSearchSortSchema([
  'created_at',
  'visit_date',
] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateMedicalRepVisitDto}. */
export type CreateMedicalRepVisitInput = z.infer<typeof CreateMedicalRepVisitDto>;
/** Parsed {@link UpdateMedicalRepVisitDto}. */
export type UpdateMedicalRepVisitInput = z.infer<typeof UpdateMedicalRepVisitDto>;
