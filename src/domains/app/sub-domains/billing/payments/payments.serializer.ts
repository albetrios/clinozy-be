import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { billedContactRef } from '@/domains/app/sub-domains/billing/invoices/invoices.serializer.js';
import type { PaymentEditRow } from './payments.repository.js';
import { toAmount, toInstant } from '@/shared/utils/validation/record-fields.util.js';
import { columnsToSplits } from './payments.ledger.js';
import type { PaymentEditOutput, PaymentOutput } from './payments.types.js';

/** Shapes an `app.payment_edits` row as the API returns it (8.C.6). */
export function serializePaymentEdit(row: PaymentEditRow): PaymentEditOutput {
  return {
    id: row.id,
    changes: row.changes,
    author_membership_id: row.author_membership_id,
    created_at: row.created_at.toISOString(),
  };
}

/**
 * Shapes an `app.payments` row as the API returns it (routes-final 8.C.6). The billed contact's
 * summary, `is_settled`, the reversal and the edits are the rules' `decorate`.
 */
export function serializePayment(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PaymentOutput {
  return {
    id: row.public_id,
    payment_number: Number(row.payment_number),
    direction: row.direction as string,
    kind: row.kind as string,
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    amount: toAmount(row.amount) ?? 0,
    splits: columnsToSplits(row),
    paid_at: toInstant(row.paid_at) as string,
    contact: billedContactRef(references.publicIdOf('contact_id', row)),
    patient_id: null,
    invoice_id: references.publicIdOf('invoice_id', row),
    invoice_credit_note_id: references.publicIdOf('invoice_credit_note_id', row),
    pending_credit_id: references.publicIdOf('pending_credit_id', row),
    stock_purchase_id: references.publicIdOf('stock_purchase_id', row),
    medical_purchase_order_id: references.publicIdOf('medical_purchase_order_id', row),
    reverses_payment_id: references.publicIdOf('reverses_payment_id', row),
    reversed_by_payment_id: null,
    payee_name: (row.payee_name as string | null) ?? null,
    expense_category: (row.expense_category as string | null) ?? null,
    reference: (row.reference as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    attachment_keys: (row.attachment_keys as string[] | null) ?? [],
    is_settled: false,
    edit_count: 0,
    last_edit: null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
