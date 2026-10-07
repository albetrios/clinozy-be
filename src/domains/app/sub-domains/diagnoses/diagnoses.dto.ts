import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `diagnoses` routes. */
export const diagnosesIdParamsDto = z
  .object({
    diagnosis_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new diagnosis. */
export const CreateDiagnosisDto = z
  .object({
    name: trimmedStringMinMax(1, 120),
  })
  .strict();

/** Body of `PATCH /app/diagnoses/{diagnosis_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateDiagnosisDto = z
  .object({
    name: trimmedStringMinMax(1, 120).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `diagnoses` list — keyset paging, `q` search, sort and filters. */
export const listDiagnosesQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateDiagnosisDto}. */
export type CreateDiagnosisInput = z.infer<typeof CreateDiagnosisDto>;
/** Parsed {@link UpdateDiagnosisDto}. */
export type UpdateDiagnosisInput = z.infer<typeof UpdateDiagnosisDto>;
