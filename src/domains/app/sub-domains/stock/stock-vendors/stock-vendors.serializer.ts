import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { StockVendorOutput } from './stock-vendors.types.js';

/**
 * Shapes an `app.stock_vendors` row as the API returns it (routes-final 9.E.6). The payable and the
 * purchase count are the rules' `decorate`.
 */
export function serializeStockVendor({ row }: { row: BaseRecordRow }): StockVendorOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    phone: (row.phone as string | null) ?? null,
    is_quick: row.is_quick as boolean,
    payable: 0,
    purchase_count: 0,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
