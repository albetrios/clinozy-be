import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { STOCK_ITEM_LEVEL } from './stock-items.constants.js';
import type { StockItemOutput } from './stock-items.types.js';

/** S6: `out` at 0, `low` up to the minimum, else `ok`. */
export function stockLevelOf({
  quantity,
  min_quantity: minQuantity,
}: {
  quantity: number;
  min_quantity: number;
}): string {
  if (quantity <= 0) return STOCK_ITEM_LEVEL.OUT;
  return quantity <= minQuantity ? STOCK_ITEM_LEVEL.LOW : STOCK_ITEM_LEVEL.OK;
}

/** S6: the whole days the stock lasts at the weekly usage — null without usage. */
export function lastsDaysOf({
  quantity,
  usage_per_week: usagePerWeek,
}: {
  quantity: number;
  usage_per_week: number;
}): number | null {
  return usagePerWeek > 0 ? Math.floor((quantity / usagePerWeek) * 7) : null;
}

/** Shapes an `app.stock_items` row as the API returns it (routes-final 9.A.6). */
export function serializeStockItem({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): StockItemOutput {
  const quantity = Number(row.quantity);
  const minQuantity = Number(row.min_quantity);
  const usagePerWeek = Number(row.usage_per_week);
  return {
    id: row.public_id,
    stock_item_number: Number(row.stock_item_number),
    name: row.name as string,
    category: row.category as string,
    unit: row.unit as string,
    size_per_unit: toAmount(row.size_per_unit),
    measure_unit: (row.measure_unit as string | null) ?? null,
    quantity,
    min_quantity: minQuantity,
    max_quantity: Number(row.max_quantity),
    usage_per_week: usagePerWeek,
    stock_vendor_id: references.publicIdOf({ field: 'stock_vendor_id', row }),
    last_rate: toAmount(row.last_rate),
    stock_level: stockLevelOf({ quantity, min_quantity: minQuantity }),
    lasts_days: lastsDaysOf({ quantity, usage_per_week: usagePerWeek }),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
