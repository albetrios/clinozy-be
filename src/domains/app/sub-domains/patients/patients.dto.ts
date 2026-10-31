import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateContactDto,
  contactAgeRangeQueryFields,
} from '@/domains/app/sub-domains/contacts/contacts.dto.js';
import {
  PATIENT_CLINICAL_ITEM_MAX,
  PATIENT_CLINICAL_LIST_MAX,
  PATIENT_CONVERSION_VALUES,
  PATIENT_NOTES_MAX,
  PATIENT_STATUS_VALUES,
  PATIENT_TYPES_VALUES,
} from './patients.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** An allergy or contraindication list — up to 30 items, each 1–120. */
const clinicalList = z
  .array(trimmedStringMinMax({ min: 1, max: PATIENT_CLINICAL_ITEM_MAX }))
  .max(PATIENT_CLINICAL_LIST_MAX);

/** The fields a patient file is written with (7.A.8 #3, #5) — each optional; create and update narrow them. */
const patientFields = {
  home_branch_id: recordIdSchema,
  types: z
    .array(z.enum(PATIENT_TYPES_VALUES))
    .max(PATIENT_TYPES_VALUES.length)
    .refine(distinct, { message: 'errors:validation.eachTypeOnce' }),
  status: z.enum(PATIENT_STATUS_VALUES),
  conversion: z.enum(PATIENT_CONVERSION_VALUES),
  doctor_membership_id: recordIdSchema.nullable(),
  follow_up_at: instantSchema.nullable(),
  notes: trimmedStringMinMax({ min: 1, max: PATIENT_NOTES_MAX }).nullable(),
  has_data_consent: z.boolean(),
  has_photo_consent: z.boolean(),
  allergies: clinicalList,
  contraindications: clinicalList,
};

/** Path params of the by-id `patients` routes. */
export const patientsIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/patients` (routes-final 7.A.8 #3): a patient file for a contact — `contact_id`,
 * **or** a new `contact` (the Contact create body, 4.A route 2) written in the same transaction
 * (P1); `home_branch_id` required.
 */
export const CreatePatientDto = z
  .object({
    contact_id: recordIdSchema.optional(),
    contact: CreateContactDto.optional(),
    home_branch_id: patientFields.home_branch_id,
    types: patientFields.types.optional(),
    status: patientFields.status.optional(),
    conversion: patientFields.conversion.optional(),
    doctor_membership_id: patientFields.doctor_membership_id.optional(),
    follow_up_at: patientFields.follow_up_at.optional(),
    notes: patientFields.notes.optional(),
    has_data_consent: patientFields.has_data_consent.optional(),
    has_photo_consent: patientFields.has_photo_consent.optional(),
    allergies: patientFields.allergies.optional(),
    contraindications: patientFields.contraindications.optional(),
  })
  .strict()
  .refine((value) => (value.contact_id === undefined) !== (value.contact === undefined), {
    path: ['contact_id'],
    message: 'errors:validation.contactIdOrContactNotBoth',
  });

/**
 * Body of `PATCH /app/patients/{patient_id}` (7.A.8 #5): any field of the create but the contact
 * (at least one; null clears an optional one); `expected_updated_at` refuses a stale save (D43).
 */
export const UpdatePatientDto = z
  .object({
    home_branch_id: patientFields.home_branch_id.optional(),
    types: patientFields.types.optional(),
    status: patientFields.status.optional(),
    conversion: patientFields.conversion.optional(),
    doctor_membership_id: patientFields.doctor_membership_id.optional(),
    follow_up_at: patientFields.follow_up_at.optional(),
    notes: patientFields.notes.optional(),
    has_data_consent: patientFields.has_data_consent.optional(),
    has_photo_consent: patientFields.has_photo_consent.optional(),
    allergies: patientFields.allergies.optional(),
    contraindications: patientFields.contraindications.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Query of the patients list and export (routes-final 7.A.8 #1, #2, P9) — `q` (the patient number
 * `PT-0412` / `#412`; through the contact: names, numbers, contact number), `status`, `conversion`,
 * `types` (several, comma-separated — any of them), `home_branch_id`, `doctor_membership_id`,
 * `contact_id`, the contact's age (`age_from` / `age_to`, AG4), the follow-up and created ranges; sort `created_at` (default, newest first) |
 * `patient_number` | `follow_up_at` (a file without one last). The saved-view registry checks a
 * view's `filters` against it.
 */
export const listPatientsQueryDto = listSearchSortSchema([
  'created_at',
  'patient_number',
  'follow_up_at',
] as const)
  .extend({
    status: z.enum(PATIENT_STATUS_VALUES).optional(),
    conversion: z.enum(PATIENT_CONVERSION_VALUES).optional(),
    types: valueListSchema(PATIENT_TYPES_VALUES).optional(),
    home_branch_id: recordIdSchema.optional(),
    doctor_membership_id: recordIdSchema.optional(),
    contact_id: recordIdSchema.optional(),
    ...contactAgeRangeQueryFields,
    follow_up_at_from: instantSchema.optional(),
    follow_up_at_to: instantSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePatientDto}. */
export type CreatePatientInput = z.infer<typeof CreatePatientDto>;
/** Parsed {@link UpdatePatientDto}. */
export type UpdatePatientInput = z.infer<typeof UpdatePatientDto>;
