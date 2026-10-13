import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  addDaysToCalendarDate,
  queryInstantRange,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateStockPurchaseDto,
  type CreateStockPurchaseInput,
  listStockPurchasesQueryDto,
  UpdateStockPurchaseDto,
  type UpdateStockPurchaseInput,
} from './stock-purchases.dto.js';

/** Parses a purchase; throws `ValidationError` naming each bad field. */
export function validateCreateStockPurchase(data: unknown): CreateStockPurchaseInput {
  return parseWithSchema({ schema: CreateStockPurchaseDto, data });
}

/** Parses a change to a purchase's bill details; throws `ValidationError` naming each bad field. */
export function validateUpdateStockPurchase(data: unknown): UpdateStockPurchaseInput {
  return parseWithSchema({ schema: UpdateStockPurchaseDto, data });
}

/** Parses the Purchases tab's query into a list input (routes-final 9.D.8 #16). */
export function validateListStockPurchasesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listStockPurchasesQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    equals: { payment_status: query.payment_status?.split(',') },
    referenceEquals: { stock_vendor_id: query.stock_vendor_id },
    derived: { search: query.q },
    ranges: {
      purchase_date: {
        from: query.purchase_date_from,
        to:
          query.purchase_date_to === undefined
            ? undefined
            : addDaysToCalendarDate({ date: query.purchase_date_to, days: 1 }),
      },
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
