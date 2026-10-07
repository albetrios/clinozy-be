import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  phoneNumberSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PATIENT_GENDER_VALUES,
  PATIENT_TYPES_VALUES,
  PATIENT_STATUS_VALUES,
  PATIENT_CONVERSION_VALUES,
  PATIENT_REFERRAL_SOURCE_VALUES,
  PATIENT_DEFAULT_CHANNEL_VALUES,
} from './patients.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id `patients` routes. */
export const patientsIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new patient. */
export const CreatePatientDto = z
  .object({
    first_name: trimmedStringMinMax(1, 60),
    last_name: trimmedStringMinMax(1, 60).nullable().optional(),
    phone: phoneNumberSchema,
    phones: z.array(trimmedStringMinMax(1, 16)).max(5).optional(),
    email: trimmedStringMinMax(3, 254).pipe(z.email()).nullable().optional(),
    gender: z.enum(PATIENT_GENDER_VALUES).nullable().optional(),
    date_of_birth: calendarDateSchema.nullable().optional(),
    address: trimmedStringMinMax(1, 240).nullable().optional(),
    home_branch_id: recordIdSchema,
    types: z
      .array(z.enum(PATIENT_TYPES_VALUES))
      .max(6)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    status: z.enum(PATIENT_STATUS_VALUES).optional(),
    conversion: z.enum(PATIENT_CONVERSION_VALUES).optional(),
    referral_source: z.enum(PATIENT_REFERRAL_SOURCE_VALUES).nullable().optional(),
    referred_by_patient_id: recordIdSchema.nullable().optional(),
    referred_by_name: trimmedStringMinMax(1, 120).nullable().optional(),
    doctor_membership_id: recordIdSchema.nullable().optional(),
    follow_up_at: instantSchema.nullable().optional(),
    notes: trimmedString().max(2000).nullable().optional(),
    lead_id: recordIdSchema.nullable().optional(),
    has_data_consent: z.boolean().optional(),
    has_photo_consent: z.boolean().optional(),
    has_marketing_consent: z.boolean().optional(),
    language: trimmedStringMinMax(1, 20).nullable().optional(),
    instagram_handles: z.array(trimmedStringMinMax(1, 60)).max(5).optional(),
    default_channel: z.enum(PATIENT_DEFAULT_CHANNEL_VALUES).nullable().optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
    household: trimmedStringMinMax(1, 240).nullable().optional(),
    allergies: z.array(trimmedStringMinMax(1, 120)).max(30).optional(),
    contraindications: z.array(trimmedStringMinMax(1, 120)).max(30).optional(),
  })
  .strict();

/** Body of `PATCH /app/patients/{patient_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePatientDto = z
  .object({
    first_name: trimmedStringMinMax(1, 60).optional(),
    last_name: trimmedStringMinMax(1, 60).nullable().optional(),
    phone: phoneNumberSchema.optional(),
    phones: z.array(trimmedStringMinMax(1, 16)).max(5).optional(),
    email: trimmedStringMinMax(3, 254).pipe(z.email()).nullable().optional(),
    gender: z.enum(PATIENT_GENDER_VALUES).nullable().optional(),
    date_of_birth: calendarDateSchema.nullable().optional(),
    address: trimmedStringMinMax(1, 240).nullable().optional(),
    home_branch_id: recordIdSchema.optional(),
    types: z
      .array(z.enum(PATIENT_TYPES_VALUES))
      .max(6)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    status: z.enum(PATIENT_STATUS_VALUES).optional(),
    conversion: z.enum(PATIENT_CONVERSION_VALUES).optional(),
    referral_source: z.enum(PATIENT_REFERRAL_SOURCE_VALUES).nullable().optional(),
    referred_by_patient_id: recordIdSchema.nullable().optional(),
    referred_by_name: trimmedStringMinMax(1, 120).nullable().optional(),
    doctor_membership_id: recordIdSchema.nullable().optional(),
    follow_up_at: instantSchema.nullable().optional(),
    notes: trimmedString().max(2000).nullable().optional(),
    lead_id: recordIdSchema.nullable().optional(),
    has_data_consent: z.boolean().optional(),
    has_photo_consent: z.boolean().optional(),
    has_marketing_consent: z.boolean().optional(),
    language: trimmedStringMinMax(1, 20).nullable().optional(),
    instagram_handles: z.array(trimmedStringMinMax(1, 60)).max(5).optional(),
    default_channel: z.enum(PATIENT_DEFAULT_CHANNEL_VALUES).nullable().optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
    household: trimmedStringMinMax(1, 240).nullable().optional(),
    allergies: z.array(trimmedStringMinMax(1, 120)).max(30).optional(),
    contraindications: z.array(trimmedStringMinMax(1, 120)).max(30).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `patients` list — keyset paging, `q` search, sort and filters. */
export const listPatientsQueryDto = listSearchSortSchema([
  'created_at',
  'first_name',
  'follow_up_at',
] as const)
  .extend({
    gender: z.enum(PATIENT_GENDER_VALUES).optional(),
    home_branch_id: recordIdSchema.optional(),
    status: z.enum(PATIENT_STATUS_VALUES).optional(),
    conversion: z.enum(PATIENT_CONVERSION_VALUES).optional(),
    referral_source: z.enum(PATIENT_REFERRAL_SOURCE_VALUES).optional(),
    doctor_membership_id: recordIdSchema.optional(),
    follow_up_at_from: z.iso.datetime({ offset: true }).optional(),
    follow_up_at_to: z.iso.datetime({ offset: true }).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Query of `GET /app/patients/{patient_id}/timeline`. */
export const timelinePatientQueryDto = z
  .object({
    group: z.enum(['all', 'clinical', 'money', 'messages']).optional(),
    before: instantSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

/** Parsed {@link CreatePatientDto}. */
export type CreatePatientInput = z.infer<typeof CreatePatientDto>;
/** Parsed {@link UpdatePatientDto}. */
export type UpdatePatientInput = z.infer<typeof UpdatePatientDto>;
