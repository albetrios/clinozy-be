import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { InvoiceCreditNoteOutput } from './invoice-credit-notes.types.js';

/**
 * Shapes an `app.invoice_credit_notes` row as the API returns it (routes-final 8.B.6). Its refund
 * payment is the rules' `decorate` — empty here.
 */
export function serializeInvoiceCreditNote({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): InvoiceCreditNoteOutput {
  return {
    id: row.public_id,
    credit_note_number: Number(row.credit_note_number),
    invoice_id: references.publicIdOf({ field: 'invoice_id', row }) ?? '',
    amount: toAmount(row.amount) ?? 0,
    reason: row.reason as string,
    payment_id: null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
