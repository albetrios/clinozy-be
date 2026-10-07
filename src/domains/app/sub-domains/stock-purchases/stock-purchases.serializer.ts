import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { StockPurchaseOutput } from './stock-purchases.types.js';

/** Shapes a `app.stock_purchases` row as the API returns it (public ids, numbers, ISO times). */
export function serializeStockPurchase(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): StockPurchaseOutput {
  return {
    id: row.public_id,
    stock_purchase_number: row.stock_purchase_number as number,
    stock_vendor_id: references.publicIdOf('stock_vendor_id', row) ?? '',
    bill_number: row.bill_number as string | null,
    purchase_date: row.purchase_date as string,
    lines: row.lines as unknown,
    bill_amount: toAmount(row.bill_amount) as number,
    paid_amount: toAmount(row.paid_amount) as number,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
