import { z } from 'zod';
import { recordIdSchema } from '@/shared/utils/validation/record-fields.util.js';

/** Path params of `GET /app/patients/{patient_id}/offering-ideas` (routes-final 7.N, route 74). */
export const patientIdeasParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Parsed {@link patientIdeasParamsDto}. */
export type PatientIdeasParams = z.infer<typeof patientIdeasParamsDto>;
