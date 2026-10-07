import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { StockMovementOutput } from './stock-movements.types.js';

/** Shapes a `app.stock_movements` row as the API returns it (public ids, numbers, ISO times). */
export function serializeStockMovement(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): StockMovementOutput {
  return {
    id: row.public_id,
    stock_item_id: references.publicIdOf('stock_item_id', row) ?? '',
    type: row.type as string,
    delta_milli: row.delta_milli as number,
    used_for: row.used_for as string | null,
    patient_id: references.publicIdOf('patient_id', row),
    stock_purchase_id: references.publicIdOf('stock_purchase_id', row),
    stock_count_id: references.publicIdOf('stock_count_id', row),
    reverts_stock_movement_id: references.publicIdOf('reverts_stock_movement_id', row),
    reverted_by_stock_movement_id: references.publicIdOf('reverted_by_stock_movement_id', row),
    revert_reason: row.revert_reason as string | null,
    note: row.note as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
