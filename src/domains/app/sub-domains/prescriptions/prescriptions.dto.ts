import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PRESCRIPTION_STATUS_VALUES,
  PRESCRIPTION_PRINT_LANGUAGE_VALUES,
} from './prescriptions.constants.js';

/** Path params of the by-id `prescriptions` routes. */
export const prescriptionsIdParamsDto = z
  .object({
    prescription_id: recordIdSchema,
  })
  .strict();

/** Path params of the `prescriptions` routes nested under their patient. */
export const prescriptionsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new prescription. */
export const CreatePrescriptionDto = z
  .object({
    appointment_id: recordIdSchema.nullable().optional(),
    doctor_membership_id: recordIdSchema,
    prescription_date: calendarDateSchema,
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
    advice: trimmedString().max(2000).nullable().optional(),
    lab_report: trimmedString().max(2000).nullable().optional(),
    procedure_today: trimmedString().max(2000).nullable().optional(),
    follow_up_date: calendarDateSchema.nullable().optional(),
    print_language: z.enum(PRESCRIPTION_PRINT_LANGUAGE_VALUES).optional(),
  })
  .strict();

/** Body of `PATCH /app/prescriptions/{prescription_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePrescriptionDto = z
  .object({
    appointment_id: recordIdSchema.nullable().optional(),
    doctor_membership_id: recordIdSchema.optional(),
    prescription_date: calendarDateSchema.optional(),
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
    advice: trimmedString().max(2000).nullable().optional(),
    lab_report: trimmedString().max(2000).nullable().optional(),
    procedure_today: trimmedString().max(2000).nullable().optional(),
    follow_up_date: calendarDateSchema.nullable().optional(),
    print_language: z.enum(PRESCRIPTION_PRINT_LANGUAGE_VALUES).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `prescriptions` list — keyset paging, `q` search, sort and filters. */
export const listPrescriptionsQueryDto = listSearchSortSchema([
  'created_at',
  'prescription_date',
] as const)
  .extend({
    patient_id: recordIdSchema.optional(),
    appointment_id: recordIdSchema.optional(),
    doctor_membership_id: recordIdSchema.optional(),
    prescription_date_from: calendarDateSchema.optional(),
    prescription_date_to: calendarDateSchema.optional(),
    status: z.enum(PRESCRIPTION_STATUS_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreatePrescriptionDto}. */
export type CreatePrescriptionInput = z.infer<typeof CreatePrescriptionDto>;
/** Parsed {@link UpdatePrescriptionDto}. */
export type UpdatePrescriptionInput = z.infer<typeof UpdatePrescriptionDto>;
