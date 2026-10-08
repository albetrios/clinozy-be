import { z } from 'zod';
import { cursorPaginationSchema } from '@/shared/utils/http/pagination.util.js';
import {
  recordIdListSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';

/**
 * Query of `GET /app/memberships` (launch §2.A.8, K5): a name or email search, the role and branch
 * to pick from, `include_ended` (every membership — any status, live or ended — for the directory)
 * and `ids` (resolve these memberships), with cursor paging.
 */
export const listAppMembershipsQueryDto = cursorPaginationSchema
  .extend({
    q: trimmedStringMinMax(1, 200).optional(),
    role_id: recordIdSchema.optional(),
    branch_id: recordIdSchema.optional(),
    include_ended: z.enum(['true', 'false']).optional().default('false'),
    ids: recordIdListSchema.optional(),
  })
  .strict();

/** Parsed {@link listAppMembershipsQueryDto}. */
export type ListAppMembershipsQueryInput = z.infer<typeof listAppMembershipsQueryDto>;
