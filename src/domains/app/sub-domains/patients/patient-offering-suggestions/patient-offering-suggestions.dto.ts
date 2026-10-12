import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  moneySchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PATIENT_OFFERING_SUGGESTION_QUANTITY_MAX,
  PATIENT_OFFERING_SUGGESTION_REASON_MAX,
  PATIENT_OFFERING_SUGGESTION_STATUS_VALUES,
} from './patient-offering-suggestions.constants.js';

/** The fields a plan row is written with (7.M.8 #69, #71) — each optional; create and update narrow them. */
const suggestionFields = {
  quantity: z.number().int().min(1).max(PATIENT_OFFERING_SUGGESTION_QUANTITY_MAX),
  price: moneySchema.nullable(),
  status: z.enum(PATIENT_OFFERING_SUGGESTION_STATUS_VALUES),
  reason: trimmedStringMinMax({ min: 1, max: PATIENT_OFFERING_SUGGESTION_REASON_MAX }).nullable(),
};

/** Path params of the by-id `patient-offering-suggestions` routes (nested under the patient). */
export const patientOfferingSuggestionsIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
    patient_offering_suggestion_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-offering-suggestions` routes nested under their patient. */
export const patientOfferingSuggestionsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/patients/{patient_id}/offering-suggestions` (routes-final 7.M.8 #69):
 * `offering_id*` (active, O13); `quantity` (1–99), `price` (the whole quantity's final amount;
 * none = the billed price × quantity, PK9), `status` (default `planned`), `reason` (≤ 200), and the
 * visit it was planned at.
 */
export const CreatePatientOfferingSuggestionDto = z
  .object({
    offering_id: recordIdSchema,
    quantity: suggestionFields.quantity.optional(),
    price: suggestionFields.price.optional(),
    status: suggestionFields.status.optional(),
    reason: suggestionFields.reason.optional(),
    appointment_id: recordIdSchema.nullable().optional(),
  })
  .strict();

/**
 * Body of `PATCH …/offering-suggestions/{patient_offering_suggestion_id}` (7.M.8 #71): `quantity`,
 * `price`, `status`, `reason` (at least one; the offering can't change); `expected_updated_at`
 * refuses a stale save (D43).
 */
export const UpdatePatientOfferingSuggestionDto = z
  .object({
    quantity: suggestionFields.quantity.optional(),
    price: suggestionFields.price.optional(),
    status: suggestionFields.status.optional(),
    reason: suggestionFields.reason.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Query of a patient's plan (7.M.8 #68): `status` (several), the visit, the check-in, the created
 * range; sort `created_at` (default, newest first).
 */
export const listPatientOfferingSuggestionsQueryDto = listSearchSortSchema(['created_at'] as const)
  .omit({ q: true })
  .extend({
    status: valueListSchema(PATIENT_OFFERING_SUGGESTION_STATUS_VALUES).optional(),
    appointment_id: recordIdSchema.optional(),
    patient_check_in_id: recordIdSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePatientOfferingSuggestionDto}. */
export type CreatePatientOfferingSuggestionInput = z.infer<
  typeof CreatePatientOfferingSuggestionDto
>;
/** Parsed {@link UpdatePatientOfferingSuggestionDto}. */
export type UpdatePatientOfferingSuggestionInput = z.infer<
  typeof UpdatePatientOfferingSuggestionDto
>;
