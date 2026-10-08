/** What was done about a check-in or a review (TR12). */
export const PATIENT_FEEDBACK_ACTION = {
  OTHER: 'other',
} as const;

/** Allowed values of `patient_feedback_actions.action`. */
export const PATIENT_FEEDBACK_ACTION_VALUES = [
  'doctor_called',
  'asked_revisit',
  'free_review_booked',
  'plan_changed',
  'replied_google',
  'replied_instagram',
  'replied_whatsapp',
  'refund_credit',
  PATIENT_FEEDBACK_ACTION.OTHER,
] as const;
