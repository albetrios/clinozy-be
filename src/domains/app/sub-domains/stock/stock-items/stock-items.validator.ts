import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateStockItemDto,
  type CreateStockItemInput,
  listStockItemsQueryDto,
  UpdateStockItemDto,
  type UpdateStockItemInput,
} from './stock-items.dto.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses a stock item create body; throws `ValidationError` naming each bad field. */
export function validateCreateStockItem(data: unknown): CreateStockItemInput {
  return parseWithSchema({ schema: CreateStockItemDto, data });
}

/** Parses a stock item change body; throws `ValidationError` naming each bad field. */
export function validateUpdateStockItem(data: unknown): UpdateStockItemInput {
  return parseWithSchema({ schema: UpdateStockItemDto, data });
}

/** Parses the Items tab's query into a list input (routes-final 9.A.8 #1). */
export function validateListStockItemsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listStockItemsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: { category: query.category?.split(',') },
    referenceEquals: { stock_vendor_id: query.stock_vendor_id },
    derived: { stock_level: query.stock_level?.split(','), lasts_days_to: query.lasts_days_to },
    ranges: {
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
