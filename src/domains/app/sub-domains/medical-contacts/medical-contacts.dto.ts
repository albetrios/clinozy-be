import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  phoneNumberSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `medical-contacts` routes. */
export const medicalContactsIdParamsDto = z
  .object({
    medical_contact_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new medical contact. */
export const CreateMedicalContactDto = z
  .object({
    name: trimmedStringMinMax(1, 120),
    phone: phoneNumberSchema.nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/medical-contacts/{medical_contact_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateMedicalContactDto = z
  .object({
    name: trimmedStringMinMax(1, 120).optional(),
    phone: phoneNumberSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `medical-contacts` list — keyset paging, `q` search, sort and filters. */
export const listMedicalContactsQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateMedicalContactDto}. */
export type CreateMedicalContactInput = z.infer<typeof CreateMedicalContactDto>;
/** Parsed {@link UpdateMedicalContactDto}. */
export type UpdateMedicalContactInput = z.infer<typeof UpdateMedicalContactDto>;
