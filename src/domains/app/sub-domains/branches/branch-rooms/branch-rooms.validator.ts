import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateBranchRoomDto,
  type CreateBranchRoomInput,
  listBranchRoomsQueryDto,
  UpdateBranchRoomDto,
  type UpdateBranchRoomInput,
} from './branch-rooms.dto.js';

/** Parses a room create body; throws `ValidationError` naming each bad field. */
export function validateCreateBranchRoom(data: unknown): CreateBranchRoomInput {
  return parseWithSchema({ schema: CreateBranchRoomDto, data });
}

/** Parses a room update body; throws `ValidationError` naming each bad field. */
export function validateUpdateBranchRoom(data: unknown): UpdateBranchRoomInput {
  return parseWithSchema({ schema: UpdateBranchRoomDto, data });
}

/** Parses the `GET /app/branches/{branch_id}/rooms` query into a list input (filters by column). */
export function validateListBranchRoomsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listBranchRoomsQueryDto, data });
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
