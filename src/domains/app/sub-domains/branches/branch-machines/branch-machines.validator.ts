import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateBranchMachineDto,
  type CreateBranchMachineInput,
  listBranchMachinesQueryDto,
  UpdateBranchMachineDto,
  type UpdateBranchMachineInput,
} from './branch-machines.dto.js';

/** Parses a machine create body; throws `ValidationError` naming each bad field. */
export function validateCreateBranchMachine(data: unknown): CreateBranchMachineInput {
  return parseWithSchema({ schema: CreateBranchMachineDto, data });
}

/** Parses a machine update body; throws `ValidationError` naming each bad field. */
export function validateUpdateBranchMachine(data: unknown): UpdateBranchMachineInput {
  return parseWithSchema({ schema: UpdateBranchMachineDto, data });
}

/** Parses the `GET /app/branches/{branch_id}/machines` query into a list input (filters by column). */
export function validateListBranchMachinesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listBranchMachinesQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      is_active: query.is_active === undefined ? undefined : query.is_active === 'true',
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
