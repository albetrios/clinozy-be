import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateBranchDto,
  type CreateBranchInput,
  listBranchesQueryDto,
  type ListBranchesQueryInput,
  UpdateBranchDto,
  type UpdateBranchInput,
} from './branches.dto.js';

/** Parses the `GET /app/branches` query; throws `ValidationError` on a bad value. */
export function validateListBranchesQuery(data: unknown): ListBranchesQueryInput {
  return parseWithSchema({ schema: listBranchesQueryDto, data });
}

/** Parses a branch create body; throws `ValidationError` naming each bad field. */
export function validateCreateBranch(data: unknown): CreateBranchInput {
  return parseWithSchema({ schema: CreateBranchDto, data });
}

/** Parses a branch update body; throws `ValidationError` naming each bad field. */
export function validateUpdateBranch(data: unknown): UpdateBranchInput {
  return parseWithSchema({ schema: UpdateBranchDto, data });
}
