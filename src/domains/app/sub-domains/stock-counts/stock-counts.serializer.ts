import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { StockCountOutput } from './stock-counts.types.js';

/** Shapes a `app.stock_counts` row as the API returns it (public ids, numbers, ISO times). */
export function serializeStockCount(
  row: BaseRecordRow,
  _references: BaseRecordReferenceLookup,
): StockCountOutput {
  return {
    id: row.public_id,
    lines: row.lines as unknown,
    counted_at: toInstant(row.counted_at) as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
