import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `offering-groups` routes. */
export const offeringGroupsIdParamsDto = z
  .object({
    offering_group_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new offering group. */
export const CreateOfferingGroupDto = z
  .object({
    name: trimmedStringMinMax(1, 60),
    sort_order: z.number().int().min(0).max(9999).optional(),
  })
  .strict();

/** Body of `PATCH /app/offering-groups/{offering_group_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateOfferingGroupDto = z
  .object({
    name: trimmedStringMinMax(1, 60).optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of the `offering-groups` list — keyset paging, `q` on the name, sort `sort_order` (default:
 * the menu order, then name — O8) | `name` | `created_at`.
 */
export const listOfferingGroupsQueryDto = listSearchSortSchema([
  'sort_order',
  'name',
  'created_at',
] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateOfferingGroupDto}. */
export type CreateOfferingGroupInput = z.infer<typeof CreateOfferingGroupDto>;
/** Parsed {@link UpdateOfferingGroupDto}. */
export type UpdateOfferingGroupInput = z.infer<typeof UpdateOfferingGroupDto>;
