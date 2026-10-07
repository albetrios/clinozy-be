import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { StockItemOutput } from './stock-items.types.js';

/** Shapes a `app.stock_items` row as the API returns it (public ids, numbers, ISO times). */
export function serializeStockItem(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): StockItemOutput {
  return {
    id: row.public_id,
    stock_item_number: row.stock_item_number as number,
    name: row.name as string,
    category: row.category as string,
    unit: row.unit as string,
    size_per_unit_milli: row.size_per_unit_milli as number | null,
    measure_unit: row.measure_unit as string | null,
    quantity_milli: row.quantity_milli as number,
    min_quantity: row.min_quantity as number,
    max_quantity: row.max_quantity as number,
    usage_per_week_milli: row.usage_per_week_milli as number,
    stock_vendor_id: references.publicIdOf('stock_vendor_id', row),
    last_rate: toAmount(row.last_rate),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
