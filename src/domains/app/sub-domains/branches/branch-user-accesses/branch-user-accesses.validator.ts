import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  ReplaceBranchUserAccessesDto,
  type ReplaceBranchUserAccessesInput,
} from './branch-user-accesses.dto.js';

/** Parses a branch access-list body; throws `ValidationError` on a bad value. */
export function validateReplaceBranchUserAccesses(data: unknown): ReplaceBranchUserAccessesInput {
  return parseWithSchema(ReplaceBranchUserAccessesDto, data);
}
