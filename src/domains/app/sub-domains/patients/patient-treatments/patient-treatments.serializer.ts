import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import { PATIENT_TREATMENT_STATUS } from './patient-treatments.constants.js';
import type { PatientTreatmentOutput } from './patient-treatments.types.js';

/** TR13: billed with a link; not billed when done with an offering and none; else not billable. */
function isBilled(row: BaseRecordRow): boolean | null {
  if (row.status !== PATIENT_TREATMENT_STATUS.DONE || row.offering_id === null) return null;
  return row.patient_offering_id !== null;
}

/**
 * Shapes an `app.patient_treatments` row as the API returns it (routes-final 7.H.6). The latest
 * check-in is the rules' `decorate` (one read per page) — empty here.
 */
export function serializePatientTreatment(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientTreatmentOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    appointment_id: references.publicIdOf('appointment_id', row),
    offering_id: references.publicIdOf('offering_id', row),
    name: row.name as string,
    template: row.template as string,
    performed_at: toInstant(row.performed_at) as string,
    doctor_membership_id: references.publicIdOf('doctor_membership_id', row),
    therapist_membership_id: references.publicIdOf('therapist_membership_id', row),
    body_parts: row.body_parts as string[],
    session_number: row.session_number as number,
    parameters: row.parameters as Record<string, string>,
    remark: row.remark as string | null,
    aftercare_call: row.aftercare_call as string,
    patient_offering_id: references.publicIdOf('patient_offering_id', row),
    is_billed: isBilled(row),
    status: row.status as string,
    reversed_reason: row.reversed_reason as string | null,
    reversed_at: toInstant(row.reversed_at),
    latest_check_in: null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
