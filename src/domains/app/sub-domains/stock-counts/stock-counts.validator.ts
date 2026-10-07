import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateStockCountDto,
  type CreateStockCountInput,
  listStockCountsQueryDto,
  UpdateStockCountDto,
  type UpdateStockCountInput,
} from './stock-counts.dto.js';

/** Parses a stock count create body; throws `ValidationError` naming each bad field. */
export function validateCreateStockCount(data: unknown): CreateStockCountInput {
  return parseWithSchema(CreateStockCountDto, data);
}

/** Parses a stock count update body; throws `ValidationError` naming each bad field. */
export function validateUpdateStockCount(data: unknown): UpdateStockCountInput {
  return parseWithSchema(UpdateStockCountDto, data);
}

/** Parses the `GET /app/stock-counts` query into a list input (filters by column). */
export function validateListStockCountsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listStockCountsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
