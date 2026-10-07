import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateMachineDto,
  type CreateMachineInput,
  listMachinesQueryDto,
  UpdateMachineDto,
  type UpdateMachineInput,
} from './machines.dto.js';

/** Parses a machine create body; throws `ValidationError` naming each bad field. */
export function validateCreateMachine(data: unknown): CreateMachineInput {
  return parseWithSchema(CreateMachineDto, data);
}

/** Parses a machine update body; throws `ValidationError` naming each bad field. */
export function validateUpdateMachine(data: unknown): UpdateMachineInput {
  return parseWithSchema(UpdateMachineDto, data);
}

/** Parses the `GET /app/machines` query into a list input (filters by column). */
export function validateListMachinesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listMachinesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    branchPublicIds: splitRecordIds(query.branch_ids),
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
