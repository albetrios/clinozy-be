import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateDayCloseDto,
  type CreateDayCloseInput,
  listDayClosesQueryDto,
  UpdateDayCloseDto,
  type UpdateDayCloseInput,
  closeDayCloseDto,
} from './day-closes.dto.js';

/** Parses a day close create body; throws `ValidationError` naming each bad field. */
export function validateCreateDayClose(data: unknown): CreateDayCloseInput {
  return parseWithSchema(CreateDayCloseDto, data);
}

/** Parses a day close update body; throws `ValidationError` naming each bad field. */
export function validateUpdateDayClose(data: unknown): UpdateDayCloseInput {
  return parseWithSchema(UpdateDayCloseDto, data);
}

/** Parses the `GET /app/day-closes` query into a list input (filters by column). */
export function validateListDayClosesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listDayClosesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    branchPublicIds: splitRecordIds(query.branch_ids),
    equals: {
      status: query.status,
    },
    referenceEquals: {
      branch_id: query.branch_id,
    },
    ranges: {
      close_date: { from: query.close_date_from, to: query.close_date_to },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}

/** Parses the body of the `close` action. */
export function validateCloseDayClose(data: unknown): Record<string, unknown> {
  return parseWithSchema(closeDayCloseDto, data ?? {});
}
