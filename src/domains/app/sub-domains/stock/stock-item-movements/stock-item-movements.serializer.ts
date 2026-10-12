import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { StockItemMovementOutput } from './stock-item-movements.types.js';

/**
 * Shapes an `app.stock_item_movements` row as the API returns it (routes-final 9.B.6). The revert
 * that undid it and the text from its purchase and the movement it reverted (D81) are the rules'
 * `decorate`.
 */
export function serializeStockItemMovement({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): StockItemMovementOutput {
  return {
    id: row.public_id,
    stock_item_id: references.publicIdOf({ field: 'stock_item_id', row }),
    type: row.type as string,
    quantity_change: Number(row.quantity_change),
    quantity_after: Number(row.quantity_after),
    used_for: (row.used_for as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    patient_treatment_id: references.publicIdOf({ field: 'patient_treatment_id', row }),
    stock_purchase_id: references.publicIdOf({ field: 'stock_purchase_id', row }),
    stock_purchase_number: null,
    bill_number: null,
    stock_count_id: references.publicIdOf({ field: 'stock_count_id', row }),
    reverts_stock_item_movement_id: references.publicIdOf({
      field: 'reverts_stock_item_movement_id',
      row,
    }),
    reverts_type: null,
    reverts_created_at: null,
    reverted_by_stock_item_movement_id: null,
    revert_reason: (row.revert_reason as string | null) ?? null,
    author_membership_id: references.publicIdOf({ field: 'author_membership_id', row }),
    created_at: row.created_at.toISOString(),
  };
}
