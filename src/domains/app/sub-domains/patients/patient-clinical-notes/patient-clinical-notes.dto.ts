import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  instantSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PATIENT_CLINICAL_NOTE_KIND,
  PATIENT_CLINICAL_NOTE_KIND_VALUES,
  PATIENT_CLINICAL_NOTE_TEXT_MAX,
} from './patient-clinical-notes.constants.js';

/** Path params of the by-id `patient-clinical-notes` routes (nested under the patient). */
export const patientClinicalNotesIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
    patient_clinical_note_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-clinical-notes` routes nested under their patient. */
export const patientClinicalNotesParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/patients/{patient_id}/clinical-notes` (routes-final 7.B.8 #9): `kind`, `text`
 * (1–500); the visit (`appointment_id`) and — on a `diagnosis` note only — its catalogue entry
 * (`patient_diagnosis_id`, P12). Notes are never edited: no update body.
 */
export const CreatePatientClinicalNoteDto = z
  .object({
    kind: z.enum(PATIENT_CLINICAL_NOTE_KIND_VALUES),
    text: trimmedStringMinMax(1, PATIENT_CLINICAL_NOTE_TEXT_MAX),
    appointment_id: recordIdSchema.nullable().optional(),
    patient_diagnosis_id: recordIdSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.patient_diagnosis_id == null || value.kind === PATIENT_CLINICAL_NOTE_KIND.DIAGNOSIS,
    {
      path: ['patient_diagnosis_id'],
      message: 'Only a diagnosis note points at the diagnosis catalogue',
    },
  );

/**
 * Query of a patient's clinical notes (7.B.8 #8): `kind` (several, comma-separated), the visit
 * (`appointment_id`), `q` (the text), the created range; sort `created_at` (default, newest first).
 */
export const listPatientClinicalNotesQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    kind: valueListSchema(PATIENT_CLINICAL_NOTE_KIND_VALUES).optional(),
    appointment_id: recordIdSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePatientClinicalNoteDto}. */
export type CreatePatientClinicalNoteInput = z.infer<typeof CreatePatientClinicalNoteDto>;
