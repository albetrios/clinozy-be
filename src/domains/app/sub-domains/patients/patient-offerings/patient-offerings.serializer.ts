import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { PATIENT_OFFERING_STATUS } from './patient-offerings.constants.js';
import type { PatientOfferingOutput } from './patient-offerings.types.js';

/**
 * Shapes an `app.patient_offerings` row as the API returns it (routes-final 7.L.6). The offering's
 * name, the invoice (through its line) and an expired `status` (the organization's today) are the
 * rules' `decorate` — here the status knows only whether a session is left.
 */
export function serializePatientOffering(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientOfferingOutput {
  const sessionsTotal = Number(row.sessions_total);
  const sessionsUsed = Number(row.sessions_used);
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    offering_id: references.publicIdOf('offering_id', row) ?? '',
    offering_name: '',
    invoice_id: null,
    invoice_item_id: references.publicIdOf('invoice_item_id', row),
    sessions_total: sessionsTotal,
    sessions_used: sessionsUsed,
    sessions_left: sessionsTotal - sessionsUsed,
    is_package: sessionsTotal > 1,
    valid_until: (row.valid_until as string | null) ?? null,
    status:
      sessionsUsed >= sessionsTotal
        ? PATIENT_OFFERING_STATUS.USED_UP
        : PATIENT_OFFERING_STATUS.ACTIVE,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
