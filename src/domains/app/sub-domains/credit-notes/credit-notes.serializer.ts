import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { CreditNoteOutput } from './credit-notes.types.js';

/** Shapes a `app.credit_notes` row as the API returns it (public ids, numbers, ISO times). */
export function serializeCreditNote(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): CreditNoteOutput {
  return {
    id: row.public_id,
    credit_note_number: row.credit_note_number as number,
    invoice_id: references.publicIdOf('invoice_id', row) ?? '',
    amount: toAmount(row.amount) as number,
    reason: row.reason as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
