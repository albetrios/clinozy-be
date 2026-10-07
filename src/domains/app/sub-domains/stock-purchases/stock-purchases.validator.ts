import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateStockPurchaseDto,
  type CreateStockPurchaseInput,
  listStockPurchasesQueryDto,
  UpdateStockPurchaseDto,
  type UpdateStockPurchaseInput,
} from './stock-purchases.dto.js';

/** Parses a stock purchase create body; throws `ValidationError` naming each bad field. */
export function validateCreateStockPurchase(data: unknown): CreateStockPurchaseInput {
  return parseWithSchema(CreateStockPurchaseDto, data);
}

/** Parses a stock purchase update body; throws `ValidationError` naming each bad field. */
export function validateUpdateStockPurchase(data: unknown): UpdateStockPurchaseInput {
  return parseWithSchema(UpdateStockPurchaseDto, data);
}

/** Parses the `GET /app/stock-purchases` query into a list input (filters by column). */
export function validateListStockPurchasesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listStockPurchasesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    referenceEquals: {
      stock_vendor_id: query.stock_vendor_id,
    },
    ranges: {
      purchase_date: { from: query.purchase_date_from, to: query.purchase_date_to },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
