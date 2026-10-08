import { APP_MATRIX_SECTIONS } from '@/domains/app/app-access-sections.js';

/** Allowed values of `membership_preferences.pinned_sections` — Today and the Roles matrix sections (launch U4). */
export const MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_VALUES = [
  'today',
  ...APP_MATRIX_SECTIONS,
] as const;

/** Allowed values of `membership_preferences.theme`. */
export const MEMBERSHIP_PREFERENCE_THEME_VALUES = ['light', 'dark', 'system'] as const;

/**
 * Allowed values of `membership_preferences.patient_file_pins` — the patient file's sections as
 * sub-domains 7 and 8 leave them (launch U4).
 */
export const MEMBERSHIP_PREFERENCE_PATIENT_FILE_PINS_VALUES = [
  'overview',
  'activity',
  'clinical_notes',
  'appointments',
  'prescriptions',
  'treatments',
  'images',
  'reports',
  'packages',
  'invoices',
  'payments',
] as const;

/** What a member has before their first save (the table's column defaults, launch U4). */
export const MEMBERSHIP_PREFERENCE_DEFAULTS = {
  pinned_sections: ['appointments', 'leads', 'patients', 'payments'],
  theme: 'light',
  patient_file_pins: ['clinical_notes', 'appointments', 'prescriptions', 'invoices'],
} as const;

/** Most `pinned_sections` a member keeps. */
export const MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_MAX = 10;

/** Most `branch_ids` in a member's branch filter. */
export const MEMBERSHIP_PREFERENCE_BRANCH_IDS_MAX = 20;

/** Most `recent_picks` a member's row holds. */
export const MEMBERSHIP_PREFERENCE_RECENT_PICKS_MAX = 60;

/** Newest `recent_picks` kept per `room:field` (the dropdowns' "Recent" group). */
export const MEMBERSHIP_PREFERENCE_RECENT_PICKS_PER_FIELD = 3;
