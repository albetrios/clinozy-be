import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `prescription-kits` routes. */
export const prescriptionKitsIdParamsDto = z
  .object({
    prescription_kit_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new prescription kit. */
export const CreatePrescriptionKitDto = z
  .object({
    name: trimmedStringMinMax(1, 80),
    items: z
      .array(
        z
          .object({
            medicine_id: recordIdSchema.nullable().optional(),
            medicine_name: trimmedStringMinMax(1, 120),
            dose_morning: z.number().int().min(0).max(2).optional(),
            dose_afternoon: z.number().int().min(0).max(2).optional(),
            dose_night: z.number().int().min(0).max(2).optional(),
            is_sos: z.boolean().optional(),
            meal: z.enum(['before', 'after']).nullable().optional(),
            timing: z
              .enum([
                'empty_stomach',
                'with_meal',
                'morning',
                'night',
                'morning_night',
                'thrice_week',
                'once_week',
                'alternate_days',
              ])
              .nullable()
              .optional(),
            timing_text: trimmedStringMinMax(1, 40).nullable().optional(),
            body_part: z
              .enum([
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
              ])
              .nullable()
              .optional(),
            body_part_text: trimmedStringMinMax(1, 40).nullable().optional(),
            quantity: z.number().int().min(1).max(999).optional(),
            remarks: trimmedStringMinMax(1, 200).nullable().optional(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
  })
  .strict();

/** Body of `PATCH /app/prescription-kits/{prescription_kit_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePrescriptionKitDto = z
  .object({
    name: trimmedStringMinMax(1, 80).optional(),
    items: z
      .array(
        z
          .object({
            medicine_id: recordIdSchema.nullable().optional(),
            medicine_name: trimmedStringMinMax(1, 120),
            dose_morning: z.number().int().min(0).max(2).optional(),
            dose_afternoon: z.number().int().min(0).max(2).optional(),
            dose_night: z.number().int().min(0).max(2).optional(),
            is_sos: z.boolean().optional(),
            meal: z.enum(['before', 'after']).nullable().optional(),
            timing: z
              .enum([
                'empty_stomach',
                'with_meal',
                'morning',
                'night',
                'morning_night',
                'thrice_week',
                'once_week',
                'alternate_days',
              ])
              .nullable()
              .optional(),
            timing_text: trimmedStringMinMax(1, 40).nullable().optional(),
            body_part: z
              .enum([
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
              ])
              .nullable()
              .optional(),
            body_part_text: trimmedStringMinMax(1, 40).nullable().optional(),
            quantity: z.number().int().min(1).max(999).optional(),
            remarks: trimmedStringMinMax(1, 200).nullable().optional(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `prescription-kits` list — keyset paging, `q` search, sort and filters. */
export const listPrescriptionKitsQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreatePrescriptionKitDto}. */
export type CreatePrescriptionKitInput = z.infer<typeof CreatePrescriptionKitDto>;
/** Parsed {@link UpdatePrescriptionKitDto}. */
export type UpdatePrescriptionKitInput = z.infer<typeof UpdatePrescriptionKitDto>;
