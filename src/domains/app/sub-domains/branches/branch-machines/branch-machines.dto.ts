import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `machines` routes. */
export const branchMachinesIdParamsDto = z
  .object({
    branch_id: recordIdSchema,
    branch_machine_id: recordIdSchema,
  })
  .strict();

/** Path params of the `machines` routes nested under their branch. */
export const branchMachinesParentParamsDto = z
  .object({
    branch_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new machine. */
export const CreateBranchMachineDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 60 }),
    is_active: z.boolean().optional(),
  })
  .strict();

/** Body of `PATCH /app/branches/{branch_id}/machines/{branch_machine_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateBranchMachineDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 60 }).optional(),
    is_active: z.boolean().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `machines` list — keyset paging, `q` search, sort and filters. */
export const listBranchMachinesQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    is_active: z.enum(['true', 'false']).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateBranchMachineDto}. */
export type CreateBranchMachineInput = z.infer<typeof CreateBranchMachineDto>;
/** Parsed {@link UpdateBranchMachineDto}. */
export type UpdateBranchMachineInput = z.infer<typeof UpdateBranchMachineDto>;
