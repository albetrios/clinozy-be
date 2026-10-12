import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { ReplaceBranchMembersDto, type ReplaceBranchMembersInput } from './branch-members.dto.js';

/** Parses a branch access-list body; throws `ValidationError` on a bad value. */
export function validateReplaceBranchMembers(data: unknown): ReplaceBranchMembersInput {
  return parseWithSchema({ schema: ReplaceBranchMembersDto, data });
}
