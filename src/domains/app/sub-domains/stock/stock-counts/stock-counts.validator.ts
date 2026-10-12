import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateStockCountDto,
  type CreateStockCountInput,
  listStockCountsQueryDto,
} from './stock-counts.dto.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses a stock check; throws `ValidationError` naming each bad field. */
export function validateCreateStockCount(data: unknown): CreateStockCountInput {
  return parseWithSchema({ schema: CreateStockCountDto, data });
}

/** A stock count is never changed (S9) — there is no change route. */
export function refuseStockCountUpdate(): Record<string, unknown> {
  throw new Error('stock counts are never changed');
}

/** Parses the past stock checks' query into a list input (routes-final 9.C.8 #13). */
export function validateListStockCountsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listStockCountsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    ranges: {
      counted_at: { from: readInstant(query.counted_from), to: readInstant(query.counted_to) },
    },
  };
}
