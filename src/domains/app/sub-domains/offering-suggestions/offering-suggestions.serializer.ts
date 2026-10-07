import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { OfferingSuggestionOutput } from './offering-suggestions.types.js';

/** Shapes a `app.offering_suggestions` row as the API returns it (public ids, numbers, ISO times). */
export function serializeOfferingSuggestion(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): OfferingSuggestionOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    offering_id: references.publicIdOf('offering_id', row) ?? '',
    quantity: row.quantity as number,
    price: toAmount(row.price),
    status: row.status as string,
    source_label: row.source_label as string,
    appointment_id: references.publicIdOf('appointment_id', row),
    reason: row.reason as string | null,
    invoice_links: row.invoice_links as unknown,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
