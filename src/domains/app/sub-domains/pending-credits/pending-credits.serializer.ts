import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { PendingCreditOutput } from './pending-credits.types.js';

/** Shapes a `app.pending_credits` row as the API returns it (public ids, numbers, ISO times). */
export function serializePendingCredit(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PendingCreditOutput {
  return {
    id: row.public_id,
    pending_credit_number: row.pending_credit_number as number,
    direction: row.direction as string,
    party_kind: row.party_kind as string,
    party_name: row.party_name as string,
    patient_id: references.publicIdOf('patient_id', row),
    amount: toAmount(row.amount) as number,
    reason: row.reason as string,
    source_payment_id: references.publicIdOf('source_payment_id', row),
    status: row.status as string,
    settled_payment_id: references.publicIdOf('settled_payment_id', row),
    invoice_id: references.publicIdOf('invoice_id', row),
    settle_by: row.settle_by as string | null,
    settled_amount: toAmount(row.settled_amount) as number,
    note: row.note as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
