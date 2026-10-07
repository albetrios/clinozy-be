import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  chipToneSchema,
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `manufacturers` routes. */
export const manufacturersIdParamsDto = z
  .object({
    manufacturer_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new manufacturer. */
export const CreateManufacturerDto = z
  .object({
    name: trimmedStringMinMax(1, 80),
    tone: chipToneSchema.optional(),
    is_quick: z.boolean().optional(),
  })
  .strict();

/** Body of `PATCH /app/manufacturers/{manufacturer_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateManufacturerDto = z
  .object({
    name: trimmedStringMinMax(1, 80).optional(),
    tone: chipToneSchema.optional(),
    is_quick: z.boolean().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `manufacturers` list — keyset paging, `q` search, sort and filters. */
export const listManufacturersQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateManufacturerDto}. */
export type CreateManufacturerInput = z.infer<typeof CreateManufacturerDto>;
/** Parsed {@link UpdateManufacturerDto}. */
export type UpdateManufacturerInput = z.infer<typeof UpdateManufacturerDto>;
