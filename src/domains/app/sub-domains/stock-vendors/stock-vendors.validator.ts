import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateStockVendorDto,
  type CreateStockVendorInput,
  listStockVendorsQueryDto,
  UpdateStockVendorDto,
  type UpdateStockVendorInput,
} from './stock-vendors.dto.js';

/** Parses a stock vendor create body; throws `ValidationError` naming each bad field. */
export function validateCreateStockVendor(data: unknown): CreateStockVendorInput {
  return parseWithSchema(CreateStockVendorDto, data);
}

/** Parses a stock vendor update body; throws `ValidationError` naming each bad field. */
export function validateUpdateStockVendor(data: unknown): UpdateStockVendorInput {
  return parseWithSchema(UpdateStockVendorDto, data);
}

/** Parses the `GET /app/stock-vendors` query into a list input (filters by column). */
export function validateListStockVendorsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listStockVendorsQueryDto, data);
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
