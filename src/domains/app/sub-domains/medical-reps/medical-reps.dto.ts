import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  phoneNumberSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id `medical-reps` routes. */
export const medicalRepsIdParamsDto = z
  .object({
    medical_rep_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new medical rep. */
export const CreateMedicalRepDto = z
  .object({
    name: trimmedStringMinMax(1, 120),
    phone: phoneNumberSchema.nullable().optional(),
    manufacturer_ids: z
      .array(recordIdSchema)
      .max(20)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    next_visit_on: calendarDateSchema.nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/medical-reps/{medical_rep_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateMedicalRepDto = z
  .object({
    name: trimmedStringMinMax(1, 120).optional(),
    phone: phoneNumberSchema.nullable().optional(),
    manufacturer_ids: z
      .array(recordIdSchema)
      .max(20)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    next_visit_on: calendarDateSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `medical-reps` list — keyset paging, `q` search, sort and filters. */
export const listMedicalRepsQueryDto = listSearchSortSchema([
  'created_at',
  'name',
  'next_visit_on',
] as const)
  .extend({
    next_visit_on_from: calendarDateSchema.optional(),
    next_visit_on_to: calendarDateSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateMedicalRepDto}. */
export type CreateMedicalRepInput = z.infer<typeof CreateMedicalRepDto>;
/** Parsed {@link UpdateMedicalRepDto}. */
export type UpdateMedicalRepInput = z.infer<typeof UpdateMedicalRepDto>;
