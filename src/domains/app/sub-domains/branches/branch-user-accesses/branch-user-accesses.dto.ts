import { z } from 'zod';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';

/** Most people one branch's access list may name in one write. */
const BRANCH_USER_ACCESSES_MAX_MEMBERSHIPS = 500;

/** Path params of the branch user-access routes. */
export const branchUserAccessesParamsDto = z
  .object({
    branch_id: trimmedStringMinMax(1, 28),
  })
  .strict();

/** Body of `PUT /app/branches/{branch_id}/user-accesses` — the branch's exact access list. */
export const ReplaceBranchUserAccessesDto = z
  .object({
    membership_ids: z
      .array(trimmedStringMinMax(1, 28))
      .max(BRANCH_USER_ACCESSES_MAX_MEMBERSHIPS)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Each membership once' }),
  })
  .strict();

/** Parsed {@link ReplaceBranchUserAccessesDto}. */
export type ReplaceBranchUserAccessesInput = z.infer<typeof ReplaceBranchUserAccessesDto>;
