import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { PatientCheckInOutput } from './patient-check-ins.types.js';

/**
 * Shapes an `app.patient_check_ins` row as the API returns it (routes-final 7.I.6). The trend, the
 * plan, the actions and `needs_action` are the rules' `decorate` (one read each per page) — empty
 * here.
 */
export function serializePatientCheckIn(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientCheckInOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    appointment_id: references.publicIdOf('appointment_id', row),
    patient_treatment_id: references.publicIdOf('patient_treatment_id', row),
    context: row.context as string,
    feel: row.feel as string,
    score: row.score as number,
    score_change: null,
    followed: row.followed as string | null,
    followed_note: row.followed_note as string | null,
    current_state: row.current_state as string | null,
    next_plan: row.next_plan as string | null,
    next_offering_ids: [],
    check_in_date: row.check_in_date as string,
    needs_action: false,
    actions: [],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
