import { RECORD_COUNT_MAX, RECORD_LABEL_MAX } from '@/shared/constants/record-fields.constants.js';

/** Allowed values of `patient_treatments.template` — the drawer's form. */
export const PATIENT_TREATMENT_TEMPLATE_VALUES = [
  'skin',
  'dental',
  'physio',
  'gynac',
  'general',
] as const;

/** Allowed values of `patient_treatments.aftercare_call` (`in_two_days` — no digits in names). */
export const PATIENT_TREATMENT_AFTERCARE_CALL_VALUES = [
  'none',
  'next_day',
  'in_two_days',
  'in_week',
] as const;

/** A treatment's status: `done`, or `reversed` with a reason — never deleted (TR6). */
export const PATIENT_TREATMENT_STATUS = {
  DONE: 'done',
  REVERSED: 'reversed',
} as const;

/** Allowed values of `patient_treatments.status`. */
export const PATIENT_TREATMENT_STATUS_VALUES = [
  PATIENT_TREATMENT_STATUS.DONE,
  PATIENT_TREATMENT_STATUS.REVERSED,
] as const;

/** Most body parts on one session (TR8). */
export const PATIENT_TREATMENT_BODY_PARTS_MAX = 12;

/** The highest session number — a package may hold up to 999 sessions (TR8). */
export const PATIENT_TREATMENT_SESSION_MAX = RECORD_COUNT_MAX;

/** The longest parameter value (the template's detail — teeth, regions; checked in the app). */
export const PATIENT_TREATMENT_PARAMETER_VALUE_MAX = RECORD_LABEL_MAX;

/** The longest remark. */
export const PATIENT_TREATMENT_REMARK_MAX = 2000;
