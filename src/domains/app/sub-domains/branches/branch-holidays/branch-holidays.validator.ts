import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateBranchHolidayDto,
  type CreateBranchHolidayInput,
  listBranchHolidaysQueryDto,
  UpdateBranchHolidayDto,
  type UpdateBranchHolidayInput,
} from './branch-holidays.dto.js';

/** Parses a branch holiday create body; throws `ValidationError` naming each bad field. */
export function validateCreateBranchHoliday(data: unknown): CreateBranchHolidayInput {
  return parseWithSchema(CreateBranchHolidayDto, data);
}

/** Parses a branch holiday update body; throws `ValidationError` naming each bad field. */
export function validateUpdateBranchHoliday(data: unknown): UpdateBranchHolidayInput {
  return parseWithSchema(UpdateBranchHolidayDto, data);
}

/** Parses the `GET /app/branches/{branch_id}/holidays` query into a list input (filters by column). */
export function validateListBranchHolidaysQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listBranchHolidaysQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    ranges: {
      holiday_date: { from: query.holiday_date_from, to: query.holiday_date_to },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
