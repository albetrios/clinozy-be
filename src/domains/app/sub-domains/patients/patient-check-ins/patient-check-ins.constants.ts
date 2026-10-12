/** How the patient feels since the last visit. */
export const PATIENT_CHECK_IN_FEEL = {
  MUCH_BETTER: 'much_better',
  BETTER: 'better',
  SAME: 'same',
  WORSE: 'worse',
} as const;

/** Allowed values of `patient_check_ins.feel`. */
export const PATIENT_CHECK_IN_FEEL_VALUES = [
  PATIENT_CHECK_IN_FEEL.MUCH_BETTER,
  PATIENT_CHECK_IN_FEEL.BETTER,
  PATIENT_CHECK_IN_FEEL.SAME,
  PATIENT_CHECK_IN_FEEL.WORSE,
] as const;

/** Allowed values of `patient_check_ins.followed` — how well the advice was followed. */
export const PATIENT_CHECK_IN_FOLLOWED_VALUES = [
  'fully',
  'mostly',
  'partly',
  'not_at_all',
] as const;

/** A score at or below this needs action (TR9 — the design's call-back). */
export const PATIENT_CHECK_IN_ACTION_SCORE_MAX = 4;

/** Most next offerings one check-in plans (TR10). */
export const PATIENT_CHECK_IN_NEXT_OFFERINGS_MAX = 10;
