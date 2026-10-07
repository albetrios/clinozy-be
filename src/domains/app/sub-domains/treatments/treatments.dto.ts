import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  TREATMENT_TEMPLATE_VALUES,
  TREATMENT_BODY_PARTS_VALUES,
  TREATMENT_AFTERCARE_CALL_VALUES,
  TREATMENT_STATUS_VALUES,
} from './treatments.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id `treatments` routes. */
export const treatmentsIdParamsDto = z
  .object({
    treatment_id: recordIdSchema,
  })
  .strict();

/** Path params of the `treatments` routes nested under their patient. */
export const treatmentsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new treatment. */
export const CreateTreatmentDto = z
  .object({
    appointment_id: recordIdSchema.nullable().optional(),
    offering_id: recordIdSchema.nullable().optional(),
    name: trimmedStringMinMax(1, 120),
    template: z.enum(TREATMENT_TEMPLATE_VALUES).optional(),
    performed_at: instantSchema.optional(),
    doctor_membership_id: recordIdSchema.nullable().optional(),
    therapist_membership_id: recordIdSchema.nullable().optional(),
    body_parts: z
      .array(z.enum(TREATMENT_BODY_PARTS_VALUES))
      .max(10)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    session_number: z.number().int().min(1).max(99).optional(),
    parameters: z.record(z.string(), trimmedString().max(80)).optional(),
    remark: trimmedString().max(2000).nullable().optional(),
    aftercare_call: z.enum(TREATMENT_AFTERCARE_CALL_VALUES).optional(),
    patient_package_id: recordIdSchema.nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/treatments/{treatment_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateTreatmentDto = z
  .object({
    appointment_id: recordIdSchema.nullable().optional(),
    offering_id: recordIdSchema.nullable().optional(),
    name: trimmedStringMinMax(1, 120).optional(),
    template: z.enum(TREATMENT_TEMPLATE_VALUES).optional(),
    performed_at: instantSchema.optional(),
    doctor_membership_id: recordIdSchema.nullable().optional(),
    therapist_membership_id: recordIdSchema.nullable().optional(),
    body_parts: z
      .array(z.enum(TREATMENT_BODY_PARTS_VALUES))
      .max(10)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    session_number: z.number().int().min(1).max(99).optional(),
    parameters: z.record(z.string(), trimmedString().max(80)).optional(),
    remark: trimmedString().max(2000).nullable().optional(),
    aftercare_call: z.enum(TREATMENT_AFTERCARE_CALL_VALUES).optional(),
    patient_package_id: recordIdSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `treatments` list — keyset paging, `q` search, sort and filters. */
export const listTreatmentsQueryDto = listSearchSortSchema(['created_at', 'performed_at'] as const)
  .extend({
    patient_id: recordIdSchema.optional(),
    appointment_id: recordIdSchema.optional(),
    performed_at_from: z.iso.datetime({ offset: true }).optional(),
    performed_at_to: z.iso.datetime({ offset: true }).optional(),
    doctor_membership_id: recordIdSchema.optional(),
    therapist_membership_id: recordIdSchema.optional(),
    status: z.enum(TREATMENT_STATUS_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Body of `POST /app/treatments/{treatment_id}/reverse`. */
export const reverseTreatmentDto = z
  .object({
    reversed_reason: trimmedStringMinMax(1, 280),
  })
  .strict();

/** Parsed {@link CreateTreatmentDto}. */
export type CreateTreatmentInput = z.infer<typeof CreateTreatmentDto>;
/** Parsed {@link UpdateTreatmentDto}. */
export type UpdateTreatmentInput = z.infer<typeof UpdateTreatmentDto>;
