import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateRoomDto,
  type CreateRoomInput,
  listRoomsQueryDto,
  UpdateRoomDto,
  type UpdateRoomInput,
} from './rooms.dto.js';

/** Parses a room create body; throws `ValidationError` naming each bad field. */
export function validateCreateRoom(data: unknown): CreateRoomInput {
  return parseWithSchema(CreateRoomDto, data);
}

/** Parses a room update body; throws `ValidationError` naming each bad field. */
export function validateUpdateRoom(data: unknown): UpdateRoomInput {
  return parseWithSchema(UpdateRoomDto, data);
}

/** Parses the `GET /app/rooms` query into a list input (filters by column). */
export function validateListRoomsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listRoomsQueryDto, data);
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
