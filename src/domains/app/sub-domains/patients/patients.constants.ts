/** Allowed values of `patients.gender`. */
export const PATIENT_GENDER_VALUES = ['female', 'male', 'other'] as const;

/** Allowed values of `patients.types`. */
export const PATIENT_TYPES_VALUES = [
  'aesthetic',
  'clinical',
  'lhr',
  'dental',
  'physio',
  'gynac',
] as const;

/** Allowed values of `patients.status`. */
export const PATIENT_STATUS_VALUES = ['new', 'regular', 'vip', 'inactive'] as const;

/** Allowed values of `patients.conversion`. */
export const PATIENT_CONVERSION_VALUES = ['converted', 'not_converted'] as const;

/** Allowed values of `patients.referral_source`. */
export const PATIENT_REFERRAL_SOURCE_VALUES = [
  'patient',
  'doctor',
  'instagram',
  'google',
  'walk_in',
  'other',
] as const;

/** Allowed values of `patients.default_channel`. */
export const PATIENT_DEFAULT_CHANNEL_VALUES = [
  'whatsapp',
  'call',
  'sms',
  'instagram',
  'email',
  'note',
] as const;
