import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { StockPurchaseOutput } from './stock-purchases.types.js';

/**
 * Shapes an `app.stock_purchases` row as the API returns it (routes-final 9.D.6). The lines and
 * the payments are the rules' `decorate`.
 */
export function serializeStockPurchase(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): StockPurchaseOutput {
  return {
    id: row.public_id,
    stock_purchase_number: Number(row.stock_purchase_number),
    stock_vendor_id: references.publicIdOf('stock_vendor_id', row),
    bill_number: (row.bill_number as string | null) ?? null,
    purchase_date: row.purchase_date as string,
    items: [],
    bill_amount: toAmount(row.bill_amount) ?? 0,
    paid_amount: toAmount(row.paid_amount) ?? 0,
    due_amount: toAmount(row.due_amount) ?? 0,
    payment_status: row.payment_status as string,
    payment_ids: [],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
