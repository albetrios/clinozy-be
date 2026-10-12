import { z } from 'zod';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import { BRANCH_MEMBERSHIP_IDS_MAX } from '@/domains/app/sub-domains/branches/branches.constants.js';

/** Path params of the branch members routes. */
export const branchMembersParamsDto = z
  .object({
    branch_id: trimmedStringMinMax({ min: 1, max: 28 }),
  })
  .strict();

/** Body of `PUT /app/branches/{branch_id}/members` — the branch's exact member list. */
export const ReplaceBranchMembersDto = z
  .object({
    membership_ids: z
      .array(trimmedStringMinMax({ min: 1, max: 28 }))
      .max(BRANCH_MEMBERSHIP_IDS_MAX)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'errors:validation.eachMembershipOnce',
      }),
  })
  .strict();

/** Parsed {@link ReplaceBranchMembersDto}. */
export type ReplaceBranchMembersInput = z.infer<typeof ReplaceBranchMembersDto>;
