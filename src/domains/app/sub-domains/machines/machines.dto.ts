import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdListSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `machines` routes. */
export const machinesIdParamsDto = z
  .object({
    machine_id: recordIdSchema,
  })
  .strict();

/** Path params of the `machines` routes nested under their branch. */
export const machinesParentParamsDto = z
  .object({
    branch_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new machine. */
export const CreateMachineDto = z
  .object({
    name: trimmedStringMinMax(1, 60),
    is_active: z.boolean().optional(),
  })
  .strict();

/** Body of `PATCH /app/machines/{machine_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateMachineDto = z
  .object({
    name: trimmedStringMinMax(1, 60).optional(),
    is_active: z.boolean().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `machines` list — keyset paging, `q` search, sort and filters. */
export const listMachinesQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    is_active: z.enum(['true', 'false']).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
    branch_ids: recordIdListSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateMachineDto}. */
export type CreateMachineInput = z.infer<typeof CreateMachineDto>;
/** Parsed {@link UpdateMachineDto}. */
export type UpdateMachineInput = z.infer<typeof UpdateMachineDto>;
