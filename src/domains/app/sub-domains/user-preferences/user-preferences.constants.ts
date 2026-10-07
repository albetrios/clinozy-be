/** Allowed values of `user_preferences.pinned_sections`. */
export const USER_PREFERENCE_PINNED_SECTIONS_VALUES = [
  'today',
  'leads',
  'appointments',
  'patients',
  'medical',
  'stock',
  'payments',
  'tasks',
  'offerings',
  'users',
] as const;

/** Allowed values of `user_preferences.theme`. */
export const USER_PREFERENCE_THEME_VALUES = ['light', 'dark', 'system'] as const;

/** Allowed values of `user_preferences.patient_file_pins`. */
export const USER_PREFERENCE_PATIENT_FILE_PINS_VALUES = [
  'overview',
  'timeline',
  'prescriptions',
  'treatments',
  'images',
  'reports',
  'packages',
  'invoices',
  'payments',
  'notes',
  'team',
] as const;
