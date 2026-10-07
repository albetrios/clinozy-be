import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PATIENT_IMAGE_ALBUM_VALUES,
  PATIENT_IMAGE_BODY_PART_VALUES,
} from './patient-images.constants.js';

/** Path params of the by-id `patient-images` routes. */
export const patientImagesIdParamsDto = z
  .object({
    patient_image_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-images` routes nested under their patient. */
export const patientImagesParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new patient image. */
export const CreatePatientImageDto = z
  .object({
    appointment_id: recordIdSchema.nullable().optional(),
    album: z.enum(PATIENT_IMAGE_ALBUM_VALUES).optional(),
    file_key: trimmedStringMinMax(1, 512),
    file_name: trimmedStringMinMax(1, 120),
    body_part: z.enum(PATIENT_IMAGE_BODY_PART_VALUES).nullable().optional(),
    taken_on: calendarDateSchema,
    caption: trimmedStringMinMax(1, 200).nullable().optional(),
    display_name: trimmedStringMinMax(1, 60).nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/patient-images/{patient_image_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePatientImageDto = z
  .object({
    appointment_id: recordIdSchema.nullable().optional(),
    album: z.enum(PATIENT_IMAGE_ALBUM_VALUES).optional(),
    file_name: trimmedStringMinMax(1, 120).optional(),
    body_part: z.enum(PATIENT_IMAGE_BODY_PART_VALUES).nullable().optional(),
    taken_on: calendarDateSchema.optional(),
    caption: trimmedStringMinMax(1, 200).nullable().optional(),
    display_name: trimmedStringMinMax(1, 60).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `patient-images` list — keyset paging, `q` search, sort and filters. */
export const listPatientImagesQueryDto = listSearchSortSchema(['created_at', 'taken_on'] as const)
  .extend({
    appointment_id: recordIdSchema.optional(),
    album: z.enum(PATIENT_IMAGE_ALBUM_VALUES).optional(),
    body_part: z.enum(PATIENT_IMAGE_BODY_PART_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreatePatientImageDto}. */
export type CreatePatientImageInput = z.infer<typeof CreatePatientImageDto>;
/** Parsed {@link UpdatePatientImageDto}. */
export type UpdatePatientImageInput = z.infer<typeof UpdatePatientImageDto>;
