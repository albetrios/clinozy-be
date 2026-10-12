import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { type PatientIdeasParams, patientIdeasParamsDto } from './patient-ideas.dto.js';

/** Parses the ideas route's path params; throws `ValidationError` naming each bad field. */
export function validatePatientIdeasParams(data: unknown): PatientIdeasParams {
  return parseWithSchema({ schema: patientIdeasParamsDto, data });
}
