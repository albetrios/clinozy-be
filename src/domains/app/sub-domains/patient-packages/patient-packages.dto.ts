import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `patient-packages` routes. */
export const patientPackagesIdParamsDto = z
  .object({
    patient_package_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-packages` routes nested under their patient. */
export const patientPackagesParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new patient package. */
export const CreatePatientPackageDto = z
  .object({
    offering_id: recordIdSchema,
    invoice_id: recordIdSchema.nullable().optional(),
    sessions_total: z.number().int().min(1).max(99),
    valid_until: calendarDateSchema.nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/patient-packages/{patient_package_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePatientPackageDto = z
  .object({
    offering_id: recordIdSchema.optional(),
    invoice_id: recordIdSchema.nullable().optional(),
    sessions_total: z.number().int().min(1).max(99).optional(),
    valid_until: calendarDateSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `patient-packages` list — keyset paging, `q` search, sort and filters. */
export const listPatientPackagesQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreatePatientPackageDto}. */
export type CreatePatientPackageInput = z.infer<typeof CreatePatientPackageDto>;
/** Parsed {@link UpdatePatientPackageDto}. */
export type UpdatePatientPackageInput = z.infer<typeof UpdatePatientPackageDto>;
