import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PATIENT_OFFERING_SESSIONS_MAX,
  PATIENT_OFFERING_STATUS_VALUES,
} from './patient-offerings.constants.js';

/** Path params of the by-id `patient-offerings` routes (nested under the patient). */
export const patientOfferingsIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
    patient_offering_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-offerings` routes nested under their patient. */
export const patientOfferingsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `PATCH …/offerings/{patient_offering_id}` (routes-final 7.L.8 #67): `valid_until` (a
 * date, or null for no expiry) and `sessions_total` (1–999, never below what was spent — PK6);
 * `expected_updated_at` refuses a stale save (D43). Bought only by invoicing (PK4) — no create.
 */
export const UpdatePatientOfferingDto = z
  .object({
    valid_until: calendarDateSchema.nullable().optional(),
    sessions_total: z.number().int().min(1).max(PATIENT_OFFERING_SESSIONS_MAX).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Query of a patient's bought offerings (7.L.8 #65): `status` (several — `active`, `used_up`,
 * `expired`), `offering_id`, `is_package` (the Packages tab), the created range; sort
 * `created_at` (default, newest first) | `valid_until`.
 */
export const listPatientOfferingsQueryDto = listSearchSortSchema([
  'created_at',
  'valid_until',
] as const)
  .omit({ q: true })
  .extend({
    status: valueListSchema(PATIENT_OFFERING_STATUS_VALUES).optional(),
    offering_id: recordIdSchema.optional(),
    is_package: z.enum(['true', 'false']).optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link UpdatePatientOfferingDto}. */
export type UpdatePatientOfferingInput = z.infer<typeof UpdatePatientOfferingDto>;
