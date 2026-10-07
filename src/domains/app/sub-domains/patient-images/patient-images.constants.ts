/** Allowed values of `patient_images.album`. */
export const PATIENT_IMAGE_ALBUM_VALUES = ['general', 'private', 'lhr'] as const;

/** Allowed values of `patient_images.body_part`. */
export const PATIENT_IMAGE_BODY_PART_VALUES = [
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
