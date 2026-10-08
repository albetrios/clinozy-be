import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PATIENT_CHECK_IN_FEEL_VALUES,
  PATIENT_CHECK_IN_FOLLOWED_VALUES,
  PATIENT_CHECK_IN_NEXT_OFFERINGS_MAX,
} from './patient-check-ins.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** The fields a check-in is written with (7.I.8 #52, #54) — each optional; create and update narrow them. */
const checkInFields = {
  feel: z.enum(PATIENT_CHECK_IN_FEEL_VALUES),
  score: z.number().int().min(1).max(10),
  check_in_date: calendarDateSchema,
  context: trimmedStringMinMax(1, 80),
  appointment_id: recordIdSchema.nullable(),
  patient_treatment_id: recordIdSchema.nullable(),
  followed: z.enum(PATIENT_CHECK_IN_FOLLOWED_VALUES).nullable(),
  followed_note: trimmedStringMinMax(1, 280).nullable(),
  current_state: trimmedStringMinMax(1, 500).nullable(),
  next_plan: trimmedStringMinMax(1, 500).nullable(),
};

/** Path params of the by-id `patient-check-ins` routes (nested under the patient). */
export const patientCheckInsIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
    patient_check_in_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-check-ins` routes nested under their patient. */
export const patientCheckInsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/patients/{patient_id}/check-ins` (routes-final 7.I.8 #52): `feel*`, `score*`;
 * `check_in_date` (default today), `context` (server-filled when not sent, TR9), the visit and the
 * session, how the advice was followed, the state and plan, and `next_offering_ids` — up to 10
 * active offerings planned for the patient (TR10, create only).
 */
export const CreatePatientCheckInDto = z
  .object({
    feel: checkInFields.feel,
    score: checkInFields.score,
    check_in_date: checkInFields.check_in_date.optional(),
    context: checkInFields.context.optional(),
    appointment_id: checkInFields.appointment_id.optional(),
    patient_treatment_id: checkInFields.patient_treatment_id.optional(),
    followed: checkInFields.followed.optional(),
    followed_note: checkInFields.followed_note.optional(),
    current_state: checkInFields.current_state.optional(),
    next_plan: checkInFields.next_plan.optional(),
    next_offering_ids: z
      .array(recordIdSchema)
      .max(PATIENT_CHECK_IN_NEXT_OFFERINGS_MAX)
      .refine(distinct, { message: 'Each offering once' })
      .optional(),
  })
  .strict();

/**
 * Body of `PATCH …/check-ins/{patient_check_in_id}` (7.I.8 #54): any field of the create but
 * `next_offering_ids` (the plan changes in the plan); `expected_updated_at` refuses a stale save (D43).
 */
export const UpdatePatientCheckInDto = z
  .object({
    feel: checkInFields.feel.optional(),
    score: checkInFields.score.optional(),
    check_in_date: checkInFields.check_in_date.optional(),
    context: checkInFields.context.optional(),
    appointment_id: checkInFields.appointment_id.optional(),
    patient_treatment_id: checkInFields.patient_treatment_id.optional(),
    followed: checkInFields.followed.optional(),
    followed_note: checkInFields.followed_note.optional(),
    current_state: checkInFields.current_state.optional(),
    next_plan: checkInFields.next_plan.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of a patient's check-ins (7.I.8 #51): `feel` (several), `needs_action`, the session, the
 * visit, the date range (inclusive), the created range; sort `check_in_date` (default, newest first)
 * | `created_at`.
 */
export const listPatientCheckInsQueryDto = listSearchSortSchema([
  'check_in_date',
  'created_at',
] as const)
  .omit({ q: true })
  .extend({
    feel: valueListSchema(PATIENT_CHECK_IN_FEEL_VALUES).optional(),
    needs_action: z.enum(['true', 'false']).optional(),
    patient_treatment_id: recordIdSchema.optional(),
    appointment_id: recordIdSchema.optional(),
    check_in_date_from: calendarDateSchema.optional(),
    check_in_date_to: calendarDateSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePatientCheckInDto}. */
export type CreatePatientCheckInInput = z.infer<typeof CreatePatientCheckInDto>;
/** Parsed {@link UpdatePatientCheckInDto}. */
export type UpdatePatientCheckInInput = z.infer<typeof UpdatePatientCheckInDto>;
