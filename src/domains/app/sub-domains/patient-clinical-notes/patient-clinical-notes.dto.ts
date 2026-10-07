import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { PATIENT_CLINICAL_NOTE_KIND_VALUES } from './patient-clinical-notes.constants.js';

/** Path params of the by-id `patient-clinical-notes` routes. */
export const patientClinicalNotesIdParamsDto = z
  .object({
    patient_clinical_note_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-clinical-notes` routes nested under their patient. */
export const patientClinicalNotesParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new clinical note. */
export const CreatePatientClinicalNoteDto = z
  .object({
    kind: z.enum(PATIENT_CLINICAL_NOTE_KIND_VALUES),
    text: trimmedStringMinMax(1, 500),
  })
  .strict();

/** Body of `PATCH /app/patient-clinical-notes/{patient_clinical_note_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePatientClinicalNoteDto = z
  .object({
    kind: z.enum(PATIENT_CLINICAL_NOTE_KIND_VALUES).optional(),
    text: trimmedStringMinMax(1, 500).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `patient-clinical-notes` list — keyset paging, `q` search, sort and filters. */
export const listPatientClinicalNotesQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    kind: z.enum(PATIENT_CLINICAL_NOTE_KIND_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreatePatientClinicalNoteDto}. */
export type CreatePatientClinicalNoteInput = z.infer<typeof CreatePatientClinicalNoteDto>;
/** Parsed {@link UpdatePatientClinicalNoteDto}. */
export type UpdatePatientClinicalNoteInput = z.infer<typeof UpdatePatientClinicalNoteDto>;
