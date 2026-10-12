import { RECORD_SHORT_TEXT_MAX } from '@/shared/constants/record-fields.constants.js';
/** A photo's album (P23): `private` is for `patient:private_album:read` holders only. */
export const PATIENT_IMAGE_ALBUM = {
  GENERAL: 'general',
  PRIVATE: 'private',
  LHR: 'lhr',
} as const;

/** Allowed values of `patient_images.album`. */
export const PATIENT_IMAGE_ALBUM_VALUES = [
  PATIENT_IMAGE_ALBUM.GENERAL,
  PATIENT_IMAGE_ALBUM.PRIVATE,
  PATIENT_IMAGE_ALBUM.LHR,
] as const;

/** Allowed values of `patient_images.stage` — a session's before and after (P24). */
export const PATIENT_IMAGE_STAGE_VALUES = ['before', 'after'] as const;

/** The upload types a photo may be (P25). */
export const PATIENT_IMAGE_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png'];

/** The largest photo upload, in bytes — 15 MB (P25). */
export const PATIENT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

/** The longest file name kept from the upload. */
export const PATIENT_IMAGE_FILE_NAME_MAX = RECORD_SHORT_TEXT_MAX;
