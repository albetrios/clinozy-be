import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount, toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { MedicalPurchaseOrderOutput } from './medical-purchase-orders.types.js';

/** Shapes a `app.medical_purchase_orders` row as the API returns it (public ids, numbers, ISO times). */
export function serializeMedicalPurchaseOrder(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): MedicalPurchaseOrderOutput {
  return {
    id: row.public_id,
    purchase_order_number: row.purchase_order_number as number,
    supplier_id: references.publicIdOf('supplier_id', row) ?? '',
    supplier_bill_number: row.supplier_bill_number as string | null,
    order_date: row.order_date as string,
    stage: row.stage as string,
    items: row.items as unknown,
    paid_amount: toAmount(row.paid_amount) as number,
    cancel_reason: row.cancel_reason as string | null,
    received_at: toInstant(row.received_at),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
