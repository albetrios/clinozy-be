/** A clinical note's kind (P12) — the visit's consult notes moved here. */
export const PATIENT_CLINICAL_NOTE_KIND = {
  COMPLAINT: 'complaint',
  FINDING: 'finding',
  DIAGNOSIS: 'diagnosis',
  TREATMENT_SUGGESTION: 'treatment_suggestion',
  FUTURE_SUGGESTION: 'future_suggestion',
  SAFETY_CHECK: 'safety_check',
} as const;

/** Allowed values of `patient_clinical_notes.kind`. */
export const PATIENT_CLINICAL_NOTE_KIND_VALUES = [
  PATIENT_CLINICAL_NOTE_KIND.COMPLAINT,
  PATIENT_CLINICAL_NOTE_KIND.FINDING,
  PATIENT_CLINICAL_NOTE_KIND.DIAGNOSIS,
  PATIENT_CLINICAL_NOTE_KIND.TREATMENT_SUGGESTION,
  PATIENT_CLINICAL_NOTE_KIND.FUTURE_SUGGESTION,
  PATIENT_CLINICAL_NOTE_KIND.SAFETY_CHECK,
] as const;

/** The longest clinical note. */
export const PATIENT_CLINICAL_NOTE_TEXT_MAX = 500;
