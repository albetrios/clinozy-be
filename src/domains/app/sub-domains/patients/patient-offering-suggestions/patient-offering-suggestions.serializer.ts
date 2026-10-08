import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { PatientOfferingSuggestionOutput } from './patient-offering-suggestions.types.js';

/** Until sub-domain 8's invoice lines name a plan row (#136), nothing of it is invoiced. */
const INVOICED_QUANTITY = 0;

/**
 * Shapes an `app.patient_offering_suggestions` row as the API returns it (routes-final 7.M.6). The
 * offering's name, the label and the lowest-price flag are the rules' `decorate` (one read each per
 * page) — empty here.
 */
export function serializePatientOfferingSuggestion(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientOfferingSuggestionOutput {
  const quantity = Number(row.quantity);
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    offering_id: references.publicIdOf('offering_id', row) ?? '',
    offering_name: '',
    quantity,
    price: toAmount(row.price),
    status: row.status as string,
    reason: row.reason as string | null,
    appointment_id: references.publicIdOf('appointment_id', row),
    patient_check_in_id: references.publicIdOf('patient_check_in_id', row),
    source_label: '',
    suggested_by_membership_id: references.publicIdOf('suggested_by_membership_id', row),
    invoiced_quantity: INVOICED_QUANTITY,
    is_fully_invoiced: INVOICED_QUANTITY >= quantity,
    is_below_lowest_price: false,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
