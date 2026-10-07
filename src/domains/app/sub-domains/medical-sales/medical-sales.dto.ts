import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { MEDICAL_SALE_STATUS_VALUES } from './medical-sales.constants.js';

/** Path params of the by-id `medical-sales` routes. */
export const medicalSalesIdParamsDto = z
  .object({
    medical_sale_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new medical sale. */
export const CreateMedicalSaleDto = z
  .object({
    patient_id: recordIdSchema.nullable().optional(),
    medical_contact_id: recordIdSchema.nullable().optional(),
    prescription_id: recordIdSchema.nullable().optional(),
    lead_id: recordIdSchema.nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/medical-sales/{medical_sale_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateMedicalSaleDto = z
  .object({
    patient_id: recordIdSchema.nullable().optional(),
    medical_contact_id: recordIdSchema.nullable().optional(),
    prescription_id: recordIdSchema.nullable().optional(),
    lead_id: recordIdSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `medical-sales` list — keyset paging, `q` search, sort and filters. */
export const listMedicalSalesQueryDto = listSearchSortSchema(['created_at', 'sold_at'] as const)
  .extend({
    patient_id: recordIdSchema.optional(),
    medical_contact_id: recordIdSchema.optional(),
    status: z.enum(MEDICAL_SALE_STATUS_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateMedicalSaleDto}. */
export type CreateMedicalSaleInput = z.infer<typeof CreateMedicalSaleDto>;
/** Parsed {@link UpdateMedicalSaleDto}. */
export type UpdateMedicalSaleInput = z.infer<typeof UpdateMedicalSaleDto>;
