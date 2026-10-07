import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount, toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { SupplierCreditOutput } from './supplier-credits.types.js';

/** Shapes a `app.supplier_credits` row as the API returns it (public ids, numbers, ISO times). */
export function serializeSupplierCredit(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): SupplierCreditOutput {
  return {
    id: row.public_id,
    supplier_id: references.publicIdOf('supplier_id', row) ?? '',
    medicine_id: references.publicIdOf('medicine_id', row),
    batch_number: row.batch_number as string | null,
    quantity: row.quantity as number,
    amount: toAmount(row.amount) as number,
    adjusted_at: toInstant(row.adjusted_at),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
