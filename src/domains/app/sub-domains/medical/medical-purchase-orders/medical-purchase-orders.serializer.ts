import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount, toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { MedicalPurchaseOrderOutput } from './medical-purchase-orders.types.js';

/**
 * Shapes an `app.medical_purchase_orders` row as the API returns it (routes-final 11.E.6). The
 * supplier's name and the lines are the rules' `decorate`.
 */
export function serializeMedicalPurchaseOrder(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): MedicalPurchaseOrderOutput {
  return {
    id: row.public_id,
    purchase_order_number: row.purchase_order_number as number,
    supplier: { id: references.publicIdOf('supplier_id', row) ?? '', name: '' },
    supplier_bill_number: (row.supplier_bill_number as string | null) ?? null,
    order_date: row.order_date as string,
    stage: row.stage as string,
    received_at: toInstant(row.received_at),
    items: [],
    item_count: 0,
    free_count: 0,
    total: toAmount(row.total) ?? 0,
    paid_amount: toAmount(row.paid_amount) ?? 0,
    credited_amount: toAmount(row.credited_amount) ?? 0,
    due_amount: toAmount(row.due_amount) ?? 0,
    payment_status: row.payment_status as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: toInstant(row.deleted_at),
    delete_reason: row.delete_reason,
    delete_note: row.delete_note,
  };
}
