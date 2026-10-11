import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `rooms` routes. */
export const branchRoomsIdParamsDto = z
  .object({
    branch_id: recordIdSchema,
    branch_room_id: recordIdSchema,
  })
  .strict();

/** Path params of the `rooms` routes nested under their branch. */
export const branchRoomsParentParamsDto = z
  .object({
    branch_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new room. */
export const CreateBranchRoomDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 60 }),
    is_active: z.boolean().optional(),
  })
  .strict();

/** Body of `PATCH /app/branches/{branch_id}/rooms/{branch_room_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateBranchRoomDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 60 }).optional(),
    is_active: z.boolean().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `rooms` list — keyset paging, `q` search, sort and filters. */
export const listBranchRoomsQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    is_active: z.enum(['true', 'false']).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateBranchRoomDto}. */
export type CreateBranchRoomInput = z.infer<typeof CreateBranchRoomDto>;
/** Parsed {@link UpdateBranchRoomDto}. */
export type UpdateBranchRoomInput = z.infer<typeof UpdateBranchRoomDto>;
