import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { patientPrescriptionItemsSchema } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.dto.js';
import { PRESCRIPTION_KIT_NAME_MAX } from './prescription-kits.constants.js';

/** Path params of the by-id `prescription-kits` routes. */
export const prescriptionKitsIdParamsDto = z
  .object({
    prescription_kit_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/prescription-kits` (routes-final 7.D.8 #22): `name` (1–80) and `items` — up to
 * 30 lines, a prescription's (P16, P17).
 */
export const CreatePrescriptionKitDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: PRESCRIPTION_KIT_NAME_MAX }),
    items: patientPrescriptionItemsSchema,
  })
  .strict();

/** Body of `PATCH /app/prescription-kits/{prescription_kit_id}` (7.D.8 #24): any of `name`, `items` (at least one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePrescriptionKitDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: PRESCRIPTION_KIT_NAME_MAX }).optional(),
    items: patientPrescriptionItemsSchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/** Query of the caller's kits (7.D.8 #21): `q` (the name); sort `created_at` (default, newest first) | `name`. */
export const listPrescriptionKitsQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePrescriptionKitDto}. */
export type CreatePrescriptionKitInput = z.infer<typeof CreatePrescriptionKitDto>;
/** Parsed {@link UpdatePrescriptionKitDto}. */
export type UpdatePrescriptionKitInput = z.infer<typeof UpdatePrescriptionKitDto>;
