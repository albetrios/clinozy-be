import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { SupplierOutput } from './suppliers.types.js';

/**
 * Shapes an `app.suppliers` row as the API returns it (routes-final 11.B.6). The manufacturers and
 * the account (payable, ageing, orders) are the rules' `decorate`.
 */
export function serializeSupplier(row: BaseRecordRow): SupplierOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    phone: (row.phone as string | null) ?? null,
    gst_number: (row.gst_number as string | null) ?? null,
    is_quick: row.is_quick as boolean,
    manufacturers: [],
    payable: 0,
    ageing_days: null,
    order_count: 0,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
