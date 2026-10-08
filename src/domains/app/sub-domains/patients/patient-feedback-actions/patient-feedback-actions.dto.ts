import { z } from 'zod';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  PATIENT_FEEDBACK_ACTION,
  PATIENT_FEEDBACK_ACTION_VALUES,
} from './patient-feedback-actions.constants.js';

/**
 * Body of `POST …/check-ins/{patient_check_in_id}/actions` and `…/reviews/{patient_review_id}/actions`
 * (routes-final 7.K.8 #63, #64): `action*`; `note` (1–280) — required for `other`.
 */
export const LogPatientFeedbackActionDto = z
  .object({
    action: z.enum(PATIENT_FEEDBACK_ACTION_VALUES),
    note: trimmedStringMinMax(1, 280).optional(),
  })
  .strict()
  .refine((value) => value.action !== PATIENT_FEEDBACK_ACTION.OTHER || value.note !== undefined, {
    path: ['note'],
    message: 'Say what was done',
  });

/** Parsed {@link LogPatientFeedbackActionDto}. */
export type LogPatientFeedbackActionInput = z.infer<typeof LogPatientFeedbackActionDto>;
