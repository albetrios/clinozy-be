import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { PATIENT_DIAGNOSIS_NAME_MAX } from './patient-diagnoses.constants.js';

/** Path params of the by-id `patient-diagnoses` routes. */
export const patientDiagnosesIdParamsDto = z
  .object({
    patient_diagnosis_id: recordIdSchema,
  })
  .strict();

/** Body of `POST /app/patient-diagnoses` (routes-final 7.E.8 #28): the `name` (1–120). */
export const CreatePatientDiagnosisDto = z
  .object({
    name: trimmedStringMinMax(1, PATIENT_DIAGNOSIS_NAME_MAX),
  })
  .strict();

/** Body of `PATCH /app/patient-diagnoses/{patient_diagnosis_id}` (7.E.8 #30): a new `name`; `expected_updated_at` refuses a stale save (D43). */
export const UpdatePatientDiagnosisDto = z
  .object({
    name: trimmedStringMinMax(1, PATIENT_DIAGNOSIS_NAME_MAX),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict();

/** Query of the diagnosis catalogue (7.E.8 #27): `q` (the name); sort `name` (default) | `created_at`. */
export const listPatientDiagnosesQueryDto = listSearchSortSchema(['name', 'created_at'] as const)
  .extend({
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePatientDiagnosisDto}. */
export type CreatePatientDiagnosisInput = z.infer<typeof CreatePatientDiagnosisDto>;
/** Parsed {@link UpdatePatientDiagnosisDto}. */
export type UpdatePatientDiagnosisInput = z.infer<typeof UpdatePatientDiagnosisDto>;
