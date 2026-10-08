/** Allowed values of `contacts.gender`. */
export const CONTACT_GENDER_VALUES = ['female', 'male', 'other'] as const;

/** Allowed values of `contacts.default_channel` — follows the last channel used (CT4). */
export const CONTACT_DEFAULT_CHANNEL_VALUES = ['whatsapp', 'call', 'instagram'] as const;

/** Allowed values of `contacts.referral_source`. */
export const CONTACT_REFERRAL_SOURCE = {
  PATIENT: 'patient',
  DOCTOR: 'doctor',
  INSTAGRAM: 'instagram',
  GOOGLE: 'google',
  WALK_IN: 'walk_in',
  OTHER: 'other',
} as const;

/** The referral sources, in the design's order. */
export const CONTACT_REFERRAL_SOURCE_VALUES = [
  CONTACT_REFERRAL_SOURCE.PATIENT,
  CONTACT_REFERRAL_SOURCE.DOCTOR,
  CONTACT_REFERRAL_SOURCE.INSTAGRAM,
  CONTACT_REFERRAL_SOURCE.GOOGLE,
  CONTACT_REFERRAL_SOURCE.WALK_IN,
  CONTACT_REFERRAL_SOURCE.OTHER,
] as const;

/**
 * The known preference tags — the design's twelve chips (CT14), labelled through i18n
 * (the `contactPreferenceTags` labels in `common.json`). A custom tag is any other key of
 * {@link CONTACT_PREFERENCE_TAG_PATTERN}.
 */
export const CONTACT_KNOWN_PREFERENCE_TAGS = [
  'no_calls',
  'text_before_calling',
  'mornings',
  'evenings',
  'after_six_pm',
  'weekdays_only',
  'weekends_only',
  'sundays_only',
  'gujarati',
  'hindi',
  'english',
  'female_doctor',
] as const;

/** A preference tag: lowercase snake_case, 2–40 characters, starting with a letter (CT14). */
export const CONTACT_PREFERENCE_TAG_PATTERN = '^[a-z][a-z0-9_]{1,39}$';

/** Most preference tags on a contact (CT14). */
export const CONTACT_PREFERENCE_TAGS_MAX = 12;

/** Most Instagram handles on a contact. */
export const CONTACT_INSTAGRAM_HANDLES_MAX = 5;

/** Fewest and most numbers on a contact (CT2). */
export const CONTACT_PHONES_MIN = 1;
/** Most numbers on a contact (CT2). */
export const CONTACT_PHONES_MAX = 5;

/** Most ids one `GET /app/contacts?ids=` loads (CT12). */
export const CONTACT_IDS_MAX = 100;

/** Most team members handling one contact (CT11). */
export const CONTACT_MEMBERSHIP_IDS_MAX = 50;
