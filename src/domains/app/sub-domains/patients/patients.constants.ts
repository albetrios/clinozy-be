import { RECORD_SHORT_TEXT_MAX } from '@/shared/constants/record-fields.constants.js';
/** The patient number's display prefix (`PT-0412`) — also read by the list's `q` (P9). */
export const PATIENT_NUMBER_PREFIX = 'PT';

/** Allowed values of `patients.types` (up to all six). */
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

/** A patient file's conversion (P4): `converted` = took a treatment. */
export const PATIENT_CONVERSION = {
  CONVERTED: 'converted',
  NOT_CONVERTED: 'not_converted',
} as const;

/** Allowed values of `patients.conversion`. */
export const PATIENT_CONVERSION_VALUES = [
  PATIENT_CONVERSION.CONVERTED,
  PATIENT_CONVERSION.NOT_CONVERTED,
] as const;

/** Most allergies, and most contraindications, on one file. */
export const PATIENT_CLINICAL_LIST_MAX = 30;
/** The longest allergy or contraindication. */
export const PATIENT_CLINICAL_ITEM_MAX = RECORD_SHORT_TEXT_MAX;
/** The longest patient notes. */
export const PATIENT_NOTES_MAX = 2000;

/**
 * The one body-part list of the patient file — photos and treatments (P25, TR8): the photo drawer's
 * parts plus `neck` and `hands`, the treatment drawer's plus `upper_lip`, `chin` and `full_body`.
 */
export const PATIENT_BODY_PART_VALUES = [
  'face',
  'upper_lip',
  'chin',
  'neck',
  'scalp',
  'hair',
  'chest',
  'back',
  'underarm',
  'arms',
  'hands',
  'legs',
  'body',
  'full_body',
  'other',
] as const;

/** `treatment_suggestion` → `Treatment suggestion` — a value as a `system` entry names it. */
export function patientFileValueLabel(value: string): string {
  const words = value.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
