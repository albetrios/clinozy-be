import { z } from 'zod';
import { cursorPaginationSchema } from '@/shared/utils/http/pagination.util.js';
import {
  recordIdListSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';

/**
 * Query of `GET /app/memberships` (launch §2.A.8, K5): a name or email search, the role and branch
 * to pick from, `holds` (only members one of whose roles grants that permission code — the
 * assignee pickers, T8), `include_ended` (every membership — any status, live or ended — for the
 * directory) and `ids` (resolve these memberships), with cursor paging.
 */
export const listAppMembershipsQueryDto = cursorPaginationSchema
  .extend({
    q: trimmedStringMinMax(1, 200).optional(),
    role_id: recordIdSchema.optional(),
    branch_id: recordIdSchema.optional(),
    holds: trimmedStringMinMax(1, 100)
      .meta({
        description:
          'One permission code: only the members one of whose roles grants it (an unknown code lists none).',
        example: 'task:update',
      })
      .optional(),
    include_ended: z.enum(['true', 'false']).optional().default('false'),
    ids: recordIdListSchema
      .meta({ example: 'mem_a1b2c3d4e5f6g7h8i9j0k,mem_k0j9i8h7g6f5e4d3c2b1a' })
      .optional(),
  })
  .strict();

/** Parsed {@link listAppMembershipsQueryDto}. */
export type ListAppMembershipsQueryInput = z.infer<typeof listAppMembershipsQueryDto>;

/**
 * Query of `GET /app/roles` (launch D81 (4)): cursor paging only — the role directory is read whole,
 * in the order the roles were made.
 */
export const listAppRolesQueryDto = cursorPaginationSchema.strict();

/** Parsed {@link listAppRolesQueryDto}. */
export type ListAppRolesQueryInput = z.infer<typeof listAppRolesQueryDto>;
