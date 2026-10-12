import type { PatientFeedbackActionRow } from './patient-feedback-actions.repository.js';
import type { PatientFeedbackActionOutput } from './patient-feedback-actions.types.js';

/** Shapes a feedback action as its check-in or review carries it (routes-final 7.K.6). */
export function serializePatientFeedbackAction(
  row: PatientFeedbackActionRow,
): PatientFeedbackActionOutput {
  return {
    id: row.public_id,
    action: row.action,
    note: row.note,
    author_membership_id: row.author_membership_id,
    created_at: row.created_at.toISOString(),
  };
}
