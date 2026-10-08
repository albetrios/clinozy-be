import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { PATIENT_BODY_PART_VALUES } from '@/domains/app/sub-domains/patients/patients.constants.js';
import {
  PATIENT_IMAGE_ALBUM_VALUES,
  PATIENT_IMAGE_STAGE_VALUES,
} from './patient-images.constants.js';

/** The fields a photo is written with (7.F.8 #34, #36) — each optional; create and update narrow them. */
const imageFields = {
  album: z.enum(PATIENT_IMAGE_ALBUM_VALUES),
  stage: z.enum(PATIENT_IMAGE_STAGE_VALUES).nullable(),
  appointment_id: recordIdSchema.nullable(),
  patient_treatment_id: recordIdSchema.nullable(),
  body_part: z.enum(PATIENT_BODY_PART_VALUES).nullable(),
  taken_on: calendarDateSchema,
  display_name: trimmedStringMinMax(1, 60).nullable(),
  caption: trimmedStringMinMax(1, 200).nullable(),
};

/** Path params of the by-id `patient-images` routes (nested under the patient). */
export const patientImagesIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
    patient_image_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-images` routes nested under their patient. */
export const patientImagesParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/patients/{patient_id}/images` (routes-final 7.F.8 #34): `file_key*` (a
 * confirmed JPG or PNG upload, ≤ 15 MB — its `file_name` is the upload's, P25); optional `album`
 * (default `general`), `stage`, the visit and the session, `body_part`, `taken_on` (default today),
 * `display_name`, `caption`.
 */
export const CreatePatientImageDto = z
  .object({
    file_key: trimmedStringMinMax(1, 512),
    album: imageFields.album.optional(),
    stage: imageFields.stage.optional(),
    appointment_id: imageFields.appointment_id.optional(),
    patient_treatment_id: imageFields.patient_treatment_id.optional(),
    body_part: imageFields.body_part.optional(),
    taken_on: imageFields.taken_on.optional(),
    display_name: imageFields.display_name.optional(),
    caption: imageFields.caption.optional(),
  })
  .strict();

/**
 * Body of `PATCH …/images/{patient_image_id}` (7.F.8 #36): any of the create's fields but
 * `file_key` (at least one; null clears an optional one) — `album` moves it; `expected_updated_at`
 * refuses a stale save (D43).
 */
export const UpdatePatientImageDto = z
  .object({
    album: imageFields.album.optional(),
    stage: imageFields.stage.optional(),
    appointment_id: imageFields.appointment_id.optional(),
    patient_treatment_id: imageFields.patient_treatment_id.optional(),
    body_part: imageFields.body_part.optional(),
    taken_on: imageFields.taken_on.optional(),
    display_name: imageFields.display_name.optional(),
    caption: imageFields.caption.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of a patient's photos (7.F.8 #33, P26): `album` (the tab — none = every album you can see),
 * the visit (`appointment_id`, or `has_appointment=false` for "Not attached to a visit"), the
 * session (`patient_treatment_id`), `stage`, `body_part`, `q` (the name or file name), the created
 * range; sort `taken_on` (default, newest first) | `created_at`.
 */
export const listPatientImagesQueryDto = listSearchSortSchema(['taken_on', 'created_at'] as const)
  .extend({
    album: z.enum(PATIENT_IMAGE_ALBUM_VALUES).optional(),
    appointment_id: recordIdSchema.optional(),
    has_appointment: z.enum(['true', 'false']).optional(),
    patient_treatment_id: recordIdSchema.optional(),
    stage: z.enum(PATIENT_IMAGE_STAGE_VALUES).optional(),
    body_part: z.enum(PATIENT_BODY_PART_VALUES).optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePatientImageDto}. */
export type CreatePatientImageInput = z.infer<typeof CreatePatientImageDto>;
/** Parsed {@link UpdatePatientImageDto}. */
export type UpdatePatientImageInput = z.infer<typeof UpdatePatientImageDto>;
