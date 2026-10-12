import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  phoneNumberSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { MEDICAL_REP_MANUFACTURERS_MAX } from './medical-reps.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** The fields a create and a change share (routes-final 11.F.8). */
const medicalRepFields = {
  name: trimmedStringMinMax({ min: 1, max: 120 }),
  phone: phoneNumberSchema.nullable(),
  next_visit_on: calendarDateSchema.nullable(),
  manufacturer_ids: z
    .array(recordIdSchema)
    .max(MEDICAL_REP_MANUFACTURERS_MAX)
    .refine(distinct, { message: 'errors:validation.eachManufacturerOnce' }),
};

/** Path params of the by-id MR routes. */
export const medicalRepsIdParamsDto = z
  .object({
    medical_rep_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/medical-reps` (11.F.8 #34): `name*` ("Alvio Pharma · Rakesh"); optional
 * `phone` (`+91` and ten digits), `next_visit_on` (today to 120 days on), `manufacturer_ids`
 * ("Represents", up to 20).
 */
export const CreateMedicalRepDto = z
  .object({
    name: medicalRepFields.name,
    phone: medicalRepFields.phone.optional(),
    next_visit_on: medicalRepFields.next_visit_on.optional(),
    manufacturer_ids: medicalRepFields.manufacturer_ids.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/medical-reps/{medical_rep_id}` (11.F.8 #36): any field of the add (`null`
 * clears the phone and the next visit); `expected_updated_at` refuses a stale save.
 */
export const UpdateMedicalRepDto = z
  .object({
    name: medicalRepFields.name.optional(),
    phone: medicalRepFields.phone.optional(),
    next_visit_on: medicalRepFields.next_visit_on.optional(),
    manufacturer_ids: medicalRepFields.manufacturer_ids.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Query of the MRs tab and picker (11.F.8 #33): `q` (name, phone), `manufacturer_id`,
 * `is_visit_overdue`, the created range; sort `name` (default, A–Z) | `next_visit_on` (none last) |
 * `created_at`.
 */
export const listMedicalRepsQueryDto = listSearchSortSchema([
  'name',
  'next_visit_on',
  'created_at',
] as const)
  .extend({
    manufacturer_id: recordIdSchema.optional(),
    is_visit_overdue: z.enum(['true', 'false']).optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateMedicalRepDto}. */
export type CreateMedicalRepInput = z.infer<typeof CreateMedicalRepDto>;
/** Parsed {@link UpdateMedicalRepDto}. */
export type UpdateMedicalRepInput = z.infer<typeof UpdateMedicalRepDto>;
