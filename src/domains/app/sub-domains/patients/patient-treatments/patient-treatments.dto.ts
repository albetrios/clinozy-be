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
  PATIENT_TREATMENT_AFTERCARE_CALL_VALUES,
  PATIENT_TREATMENT_BODY_PARTS_MAX,
  PATIENT_TREATMENT_PARAMETER_VALUE_MAX,
  PATIENT_TREATMENT_REMARK_MAX,
  PATIENT_TREATMENT_SESSION_MAX,
  PATIENT_TREATMENT_STATUS_VALUES,
  PATIENT_TREATMENT_TEMPLATE_VALUES,
} from './patient-treatments.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Most parameters on one session. */
const PARAMETERS_MAX = 30;

/** The fields a session is written with (7.H.8 #47, #49) — each optional; create and update narrow them. */
const treatmentFields = {
  name: trimmedStringMinMax({ min: 1, max: 120 }),
  appointment_id: recordIdSchema.nullable(),
  offering_id: recordIdSchema.nullable(),
  template: z.enum(PATIENT_TREATMENT_TEMPLATE_VALUES),
  performed_at: instantSchema,
  doctor_membership_id: recordIdSchema.nullable(),
  therapist_membership_id: recordIdSchema.nullable(),
  body_parts: z
    .array(z.enum(PATIENT_BODY_PART_VALUES))
    .max(PATIENT_TREATMENT_BODY_PARTS_MAX)
    .refine(distinct, { message: 'errors:validation.eachBodyPartOnce' }),
  session_number: z.number().int().min(1).max(PATIENT_TREATMENT_SESSION_MAX),
  parameters: z
    .record(
      trimmedStringMinMax({ min: 1, max: 40 }),
      z.string().max(PATIENT_TREATMENT_PARAMETER_VALUE_MAX),
    )
    .refine((value) => Object.keys(value).length <= PARAMETERS_MAX, {
      message: 'errors:validation.upToParameters',
      params: { messageParams: { max: PARAMETERS_MAX } },
    }),
  remark: trimmedStringMinMax({ min: 1, max: PATIENT_TREATMENT_REMARK_MAX }).nullable(),
  aftercare_call: z.enum(PATIENT_TREATMENT_AFTERCARE_CALL_VALUES),
};

/** Path params of the by-id `patient-treatments` routes (nested under the patient). */
export const patientTreatmentsIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
    patient_treatment_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-treatments` routes nested under their patient. */
export const patientTreatmentsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/patients/{patient_id}/treatments` (routes-final 7.H.8 #47): `name*`; the
 * visit, offering, form, time, team, body parts, number, parameters, remark, aftercare — and
 * `patient_offering_id`, the bought session it spends (TR7): its offering becomes the session's and
 * its count the session's number, so `session_number` is not sent with it.
 */
export const CreatePatientTreatmentDto = z
  .object({
    name: treatmentFields.name,
    appointment_id: treatmentFields.appointment_id.optional(),
    offering_id: treatmentFields.offering_id.optional(),
    template: treatmentFields.template.optional(),
    performed_at: treatmentFields.performed_at.optional(),
    doctor_membership_id: treatmentFields.doctor_membership_id.optional(),
    therapist_membership_id: treatmentFields.therapist_membership_id.optional(),
    body_parts: treatmentFields.body_parts.optional(),
    session_number: treatmentFields.session_number.optional(),
    parameters: treatmentFields.parameters.optional(),
    remark: treatmentFields.remark.optional(),
    aftercare_call: treatmentFields.aftercare_call.optional(),
    patient_offering_id: recordIdSchema.optional(),
  })
  .strict()
  .refine((value) => !(value.patient_offering_id && value.session_number !== undefined), {
    path: ['session_number'],
    message: 'errors:validation.spentSessionTakesOfferingNumber',
  });

/**
 * Body of `PATCH …/treatments/{patient_treatment_id}` (7.H.8 #49): any field of the create but
 * `patient_offering_id` (at least one) — and not `session_number` or `offering_id` once linked;
 * `expected_updated_at` refuses a stale save (D43).
 */
export const UpdatePatientTreatmentDto = z
  .object({
    name: treatmentFields.name.optional(),
    appointment_id: treatmentFields.appointment_id.optional(),
    offering_id: treatmentFields.offering_id.optional(),
    template: treatmentFields.template.optional(),
    performed_at: treatmentFields.performed_at.optional(),
    doctor_membership_id: treatmentFields.doctor_membership_id.optional(),
    therapist_membership_id: treatmentFields.therapist_membership_id.optional(),
    body_parts: treatmentFields.body_parts.optional(),
    session_number: treatmentFields.session_number.optional(),
    parameters: treatmentFields.parameters.optional(),
    remark: treatmentFields.remark.optional(),
    aftercare_call: treatmentFields.aftercare_call.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/** Body of `POST …/treatments/{patient_treatment_id}/reverse` (7.H.8 #50): `reason*` (1–280). */
export const ReversePatientTreatmentDto = z
  .object({
    reason: trimmedStringMinMax({ min: 1, max: 280 }),
  })
  .strict();

/**
 * Query of the treatment lists (7.H.8 #45, #46): the references, `is_billed` (TR13), `status`, the
 * performed days (inclusive, the organization's), `q` (the name), the created range; sort
 * `performed_at` (default, newest first) | `created_at`. The nested list's path wins over
 * `patient_id`.
 */
export const listPatientTreatmentsQueryDto = listSearchSortSchema([
  'performed_at',
  'created_at',
] as const)
  .extend({
    patient_id: recordIdSchema.optional(),
    doctor_membership_id: recordIdSchema.optional(),
    therapist_membership_id: recordIdSchema.optional(),
    appointment_id: recordIdSchema.optional(),
    offering_id: recordIdSchema.optional(),
    patient_offering_id: recordIdSchema.optional(),
    is_billed: z.enum(['true', 'false']).optional(),
    status: z.enum(PATIENT_TREATMENT_STATUS_VALUES).optional(),
    performed_from: calendarDateSchema.optional(),
    performed_to: calendarDateSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePatientTreatmentDto}. */
export type CreatePatientTreatmentInput = z.infer<typeof CreatePatientTreatmentDto>;
/** Parsed {@link UpdatePatientTreatmentDto}. */
export type UpdatePatientTreatmentInput = z.infer<typeof UpdatePatientTreatmentDto>;
