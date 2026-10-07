import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateStockItemDto,
  type CreateStockItemInput,
  listStockItemsQueryDto,
  UpdateStockItemDto,
  type UpdateStockItemInput,
} from './stock-items.dto.js';

/** Parses a stock item create body; throws `ValidationError` naming each bad field. */
export function validateCreateStockItem(data: unknown): CreateStockItemInput {
  return parseWithSchema(CreateStockItemDto, data);
}

/** Parses a stock item update body; throws `ValidationError` naming each bad field. */
export function validateUpdateStockItem(data: unknown): UpdateStockItemInput {
  return parseWithSchema(UpdateStockItemDto, data);
}

/** Parses the `GET /app/stock-items` query into a list input (filters by column). */
export function validateListStockItemsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listStockItemsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      category: query.category,
    },
    referenceEquals: {
      stock_vendor_id: query.stock_vendor_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
