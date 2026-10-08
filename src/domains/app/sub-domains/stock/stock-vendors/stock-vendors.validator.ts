import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateStockVendorDto,
  type CreateStockVendorInput,
  listStockVendorsQueryDto,
  UpdateStockVendorDto,
  type UpdateStockVendorInput,
} from './stock-vendors.dto.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses a stock vendor create body; throws `ValidationError` naming each bad field. */
export function validateCreateStockVendor(data: unknown): CreateStockVendorInput {
  return parseWithSchema(CreateStockVendorDto, data);
}

/** Parses a stock vendor change body; throws `ValidationError` naming each bad field. */
export function validateUpdateStockVendor(data: unknown): UpdateStockVendorInput {
  return parseWithSchema(UpdateStockVendorDto, data);
}

/** Parses the vendor picker's query into a list input (routes-final 9.E.8 #23). */
export function validateListStockVendorsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listStockVendorsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    ranges: {
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
