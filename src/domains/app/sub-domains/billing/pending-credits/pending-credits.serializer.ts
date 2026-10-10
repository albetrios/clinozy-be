import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { billedContactRef } from '@/domains/app/sub-domains/billing/invoices/invoices.serializer.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { PendingCreditOutput } from './pending-credits.types.js';

/**
 * Shapes an `app.pending_credits` row as the API returns it (routes-final 8.D.6). The contact's
 * summary, the settlements and who recorded it are the rules' `decorate`.
 */
export function serializePendingCredit(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PendingCreditOutput {
  const amount = toAmount(row.amount) ?? 0;
  const settled = toAmount(row.settled_amount) ?? 0;
  return {
    id: row.public_id,
    pending_credit_number: Number(row.pending_credit_number),
    direction: row.direction as string,
    contact: billedContactRef(references.publicIdOf('contact_id', row)),
    patient_id: null,
    party_name: (row.party_name as string | null) ?? null,
    amount,
    settled_amount: settled,
    left_amount: Math.round((amount - settled) * 100) / 100,
    status: row.status as string,
    reason: row.reason as string,
    note: (row.note as string | null) ?? null,
    invoice_id: references.publicIdOf('invoice_id', row),
    source_payment_id: references.publicIdOf('source_payment_id', row),
    settle_by: (row.settle_by as string | null) ?? null,
    payment_ids: [],
    created_by_membership_id: null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
