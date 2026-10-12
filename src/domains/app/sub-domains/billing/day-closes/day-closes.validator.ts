import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  addDaysToCalendarDate,
  splitRecordIds,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  CloseDayCloseDto,
  CreateDayCloseDto,
  type CreateDayCloseInput,
  listDayClosesQueryDto,
  ReopenDayCloseDto,
} from './day-closes.dto.js';

/** Parses a day-open body; throws `ValidationError` naming each bad field. */
export function validateCreateDayClose(data: unknown): CreateDayCloseInput {
  return parseWithSchema({ schema: CreateDayCloseDto, data });
}

/** A day close is never changed (B25) — there is no change route. */
export function refuseDayCloseUpdate(): Record<string, unknown> {
  throw new Error('day closes are never changed');
}

/** Parses the body of the `close` action (8.E.8 #31). */
export function validateCloseDayClose(data: unknown): Record<string, unknown> {
  return parseWithSchema({ schema: CloseDayCloseDto, data: data ?? {} });
}

/** Parses the body of the `reopen` action (8.E.8 #32). */
export function validateReopenDayClose(data: unknown): Record<string, unknown> {
  return parseWithSchema({ schema: ReopenDayCloseDto, data: data ?? {} });
}

/** Parses the day-close list query into a list input (routes-final 8.E.8 #28). */
export function validateListDayClosesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listDayClosesQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    branchPublicIds: query.branch_id === undefined ? undefined : splitRecordIds(query.branch_id),
    equals: {
      status: query.status,
    },
    ranges: {
      close_date: {
        from: query.close_date_from,
        to:
          query.close_date_to === undefined
            ? undefined
            : addDaysToCalendarDate({ date: query.close_date_to, days: 1 }),
      },
    },
  };
}
