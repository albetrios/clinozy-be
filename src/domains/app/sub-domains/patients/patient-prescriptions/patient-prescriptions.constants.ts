/** A prescription's status: a `draft` until a prescriber approves it — then final (P15). */
export const PATIENT_PRESCRIPTION_STATUS = {
  DRAFT: 'draft',
  APPROVED: 'approved',
} as const;

/** Allowed values of `patient_prescriptions.status`. */
export const PATIENT_PRESCRIPTION_STATUS_VALUES = [
  PATIENT_PRESCRIPTION_STATUS.DRAFT,
  PATIENT_PRESCRIPTION_STATUS.APPROVED,
] as const;

/** Allowed values of `patient_prescriptions.print_language`. */
export const PATIENT_PRESCRIPTION_PRINT_LANGUAGE_VALUES = ['english', 'gujarati', 'hindi'] as const;

/** Most lines on one prescription or kit (P16). */
export const PATIENT_PRESCRIPTION_ITEMS_MAX = 30;

/** The longest advice, lab report or procedure-today text. */
export const PATIENT_PRESCRIPTION_TEXT_MAX = 2000;
