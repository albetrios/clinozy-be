/** Allowed values of `treatments.template`. */
export const TREATMENT_TEMPLATE_VALUES = ['skin', 'dental', 'physio', 'gynac', 'general'] as const;

/** Allowed values of `treatments.body_parts`. */
export const TREATMENT_BODY_PARTS_VALUES = [
  'face',
  'scalp',
  'hair',
  'body',
  'chest',
  'back',
  'underarm',
  'legs',
  'arms',
  'other',
] as const;

/** Allowed values of `treatments.aftercare_call`. */
export const TREATMENT_AFTERCARE_CALL_VALUES = [
  'none',
  'next_day',
  'in_two_days',
  'in_week',
] as const;

/** Allowed values of `treatments.status`. */
export const TREATMENT_STATUS_VALUES = ['done', 'reversed'] as const;
