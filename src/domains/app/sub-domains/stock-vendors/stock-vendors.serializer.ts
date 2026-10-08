import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { StockVendorOutput } from './stock-vendors.types.js';

/** Shapes a `app.stock_vendors` row as the API returns it (public ids, numbers, ISO times). */
export function serializeStockVendor(
  row: BaseRecordRow,
  _references: BaseRecordReferenceLookup,
): StockVendorOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    phone: row.phone as string | null,
    is_quick: row.is_quick as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
