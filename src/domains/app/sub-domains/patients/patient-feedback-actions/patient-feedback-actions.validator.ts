import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  LogPatientFeedbackActionDto,
  type LogPatientFeedbackActionInput,
} from './patient-feedback-actions.dto.js';

/** Parses a feedback action body; throws `ValidationError` naming each bad field. */
export function validateLogPatientFeedbackAction(data: unknown): LogPatientFeedbackActionInput {
  return parseWithSchema({ schema: LogPatientFeedbackActionDto, data });
}
