import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { SUPPLIER_CREDIT_STATUS } from './supplier-credits.constants.js';
import type { SupplierCreditOutput } from './supplier-credits.types.js';

/**
 * Shapes an `app.supplier_credits` row as the API returns it (routes-final 11.C.6). The supplier,
 * medicine and batch names are the rules' `decorate`.
 */
export function serializeSupplierCredit(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): SupplierCreditOutput {
  const amount = toAmount(row.amount) ?? 0;
  const applied = toAmount(row.applied_amount) ?? 0;
  return {
    id: row.public_id,
    supplier_id: references.publicIdOf('supplier_id', row) ?? '',
    supplier_name: '',
    medicine_id: references.publicIdOf('medicine_id', row) ?? '',
    medicine_name: '',
    medicine_batch_id: references.publicIdOf('medicine_batch_id', row) ?? '',
    batch_number: '',
    quantity: row.quantity as number,
    rate: toAmount(row.rate) ?? 0,
    amount,
    applied_amount: applied,
    status:
      Math.round(applied * 100) < Math.round(amount * 100)
        ? SUPPLIER_CREDIT_STATUS.OPEN
        : SUPPLIER_CREDIT_STATUS.ADJUSTED,
    created_by_membership_id: references.publicIdOf('created_by_membership_id', row),
    created_at: row.created_at.toISOString(),
  };
}
