import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  MANUFACTURER_LINKS_MAX,
  MANUFACTURER_NAME_MAX,
  MANUFACTURER_TONE_VALUES,
} from './manufacturers.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Up to 50 record ids, each once — the suppliers or MRs a save links (MD9). */
const linkIdsSchema = z
  .array(recordIdSchema)
  .max(MANUFACTURER_LINKS_MAX)
  .refine(distinct, { message: 'Each id once' });

/** The fields a create and a change share (routes-final 11.A.8). */
const manufacturerFields = {
  name: trimmedStringMinMax({ min: 1, max: MANUFACTURER_NAME_MAX }),
  tone: z.enum(MANUFACTURER_TONE_VALUES),
  supplier_ids: linkIdsSchema,
  medical_rep_ids: linkIdsSchema,
};

/** Path params of the by-id manufacturer routes. */
export const manufacturersIdParamsDto = z
  .object({
    manufacturer_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/manufacturers` (11.A.8 #2): `name*` (stored upper case, unique in any case);
 * optional `tone`, `is_quick` (a picker's inline add — it takes the next tone), `supplier_ids`,
 * `medical_rep_ids`.
 */
export const CreateManufacturerDto = z
  .object({
    name: manufacturerFields.name,
    tone: manufacturerFields.tone.optional(),
    is_quick: z.boolean().optional(),
    supplier_ids: manufacturerFields.supplier_ids.optional(),
    medical_rep_ids: manufacturerFields.medical_rep_ids.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/manufacturers/{manufacturer_id}` (11.A.8 #4): `name`, `tone`, `supplier_ids`,
 * `medical_rep_ids` (each list replaces the links); `expected_updated_at` refuses a stale save.
 */
export const UpdateManufacturerDto = z
  .object({
    name: manufacturerFields.name.optional(),
    tone: manufacturerFields.tone.optional(),
    supplier_ids: manufacturerFields.supplier_ids.optional(),
    medical_rep_ids: manufacturerFields.medical_rep_ids.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of the Manufacturers tab and picker (11.A.8 #1): `q` (name), `supplier_id`,
 * `medical_rep_id`, the created range; sort `name` (default, A–Z) | `created_at`.
 */
export const listManufacturersQueryDto = listSearchSortSchema(['name', 'created_at'] as const)
  .extend({
    supplier_id: recordIdSchema.optional(),
    medical_rep_id: recordIdSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateManufacturerDto}. */
export type CreateManufacturerInput = z.infer<typeof CreateManufacturerDto>;
/** Parsed {@link UpdateManufacturerDto}. */
export type UpdateManufacturerInput = z.infer<typeof UpdateManufacturerDto>;
