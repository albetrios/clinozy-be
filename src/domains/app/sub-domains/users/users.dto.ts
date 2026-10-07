import { z } from 'zod';
import { recordIdSchema } from '@/shared/utils/validation/record-fields.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';

/** Query of `GET /app/users` — a name search and the role and branch to pick from. */
export const listAppUsersQueryDto = z
  .object({
    q: trimmedStringMinMax(1, 80).optional(),
    role_id: recordIdSchema.optional(),
    branch_id: recordIdSchema.optional(),
  })
  .strict();

/** Parsed {@link listAppUsersQueryDto}. */
export type ListAppUsersQueryInput = z.infer<typeof listAppUsersQueryDto>;
