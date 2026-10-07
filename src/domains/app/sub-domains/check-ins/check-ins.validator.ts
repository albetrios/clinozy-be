import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateCheckInDto,
  type CreateCheckInInput,
  listCheckInsQueryDto,
  UpdateCheckInDto,
  type UpdateCheckInInput,
} from './check-ins.dto.js';

/** Parses a check-in create body; throws `ValidationError` naming each bad field. */
export function validateCreateCheckIn(data: unknown): CreateCheckInInput {
  return parseWithSchema(CreateCheckInDto, data);
}

/** Parses a check-in update body; throws `ValidationError` naming each bad field. */
export function validateUpdateCheckIn(data: unknown): UpdateCheckInInput {
  return parseWithSchema(UpdateCheckInDto, data);
}

/** Parses the `GET /app/check-ins` query into a list input (filters by column). */
export function validateListCheckInsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listCheckInsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      feel: query.feel,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
