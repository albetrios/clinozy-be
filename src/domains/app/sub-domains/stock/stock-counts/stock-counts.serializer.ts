import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { StockCountOutput } from './stock-counts.types.js';

/**
 * Shapes an `app.stock_counts` row as the API returns it (routes-final 9.C.6). The lines are the
 * rules' `decorate`.
 */
export function serializeStockCount(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): StockCountOutput {
  return {
    id: row.public_id,
    counted_at: (row.counted_at as Date).toISOString(),
    author_membership_id: references.publicIdOf('author_membership_id', row),
    lines: [],
    changed_item_count: 0,
    created_at: row.created_at.toISOString(),
  };
}
