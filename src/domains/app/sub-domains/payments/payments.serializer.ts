import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount, toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { PaymentOutput } from './payments.types.js';

/** Shapes a `app.payments` row as the API returns it (public ids, numbers, ISO times). */
export function serializePayment(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PaymentOutput {
  return {
    id: row.public_id,
    payment_number: row.payment_number as number,
    direction: row.direction as string,
    kind: row.kind as string,
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    amount: toAmount(row.amount) as number,
    splits: row.splits as unknown,
    patient_id: references.publicIdOf('patient_id', row),
    invoice_id: references.publicIdOf('invoice_id', row),
    payee_name: row.payee_name as string | null,
    expense_category: row.expense_category as string | null,
    bill_ref: row.bill_ref as unknown | null,
    credit_note_id: references.publicIdOf('credit_note_id', row),
    pending_credit_id: references.publicIdOf('pending_credit_id', row),
    note: row.note as string | null,
    paid_at: toInstant(row.paid_at) as string,
    day_close_id: references.publicIdOf('day_close_id', row),
    bill_allocations: row.bill_allocations as unknown,
    reference: row.reference as string | null,
    attachment_keys: row.attachment_keys as string[],
    is_checked_at_close: row.is_checked_at_close as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
