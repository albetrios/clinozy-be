import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { PatientOfferingSuggestionOutput } from './patient-offering-suggestions.types.js';

/**
 * Shapes an `app.patient_offering_suggestions` row as the API returns it (routes-final 7.M.6). The
 * offering's name, the label, the lowest-price flag and what is invoiced are the rules' `decorate`
 * (one read each per page) — empty here.
 */
export function serializePatientOfferingSuggestion({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): PatientOfferingSuggestionOutput {
  const quantity = Number(row.quantity);
  return {
    id: row.public_id,
    patient_id: references.publicIdOf({ field: 'patient_id', row }) ?? '',
    offering_id: references.publicIdOf({ field: 'offering_id', row }) ?? '',
    offering_name: '',
    quantity,
    price: toAmount(row.price),
    status: row.status as string,
    reason: row.reason as string | null,
    appointment_id: references.publicIdOf({ field: 'appointment_id', row }),
    patient_check_in_id: references.publicIdOf({ field: 'patient_check_in_id', row }),
    source_label: '',
    suggested_by_membership_id: references.publicIdOf({ field: 'suggested_by_membership_id', row }),
    invoiced_quantity: 0,
    is_fully_invoiced: false,
    is_below_lowest_price: false,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
