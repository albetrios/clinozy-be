import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `patient-notes` routes. */
export const patientNotesIdParamsDto = z
  .object({
    patient_note_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-notes` routes nested under their patient. */
export const patientNotesParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new patient note. */
export const CreatePatientNoteDto = z
  .object({
    body: trimmedString().max(2000),
  })
  .strict();

/** Body of `PATCH /app/patient-notes/{patient_note_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePatientNoteDto = z
  .object({
    body: trimmedString().max(2000).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `patient-notes` list — keyset paging, `q` search, sort and filters. */
export const listPatientNotesQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreatePatientNoteDto}. */
export type CreatePatientNoteInput = z.infer<typeof CreatePatientNoteDto>;
/** Parsed {@link UpdatePatientNoteDto}. */
export type UpdatePatientNoteInput = z.infer<typeof UpdatePatientNoteDto>;
