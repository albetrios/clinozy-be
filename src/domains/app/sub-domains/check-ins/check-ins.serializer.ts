import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { CheckInOutput } from './check-ins.types.js';

/** Shapes a `app.check_ins` row as the API returns it (public ids, numbers, ISO times). */
export function serializeCheckIn(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): CheckInOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    appointment_id: references.publicIdOf('appointment_id', row),
    treatment_id: references.publicIdOf('treatment_id', row),
    context: row.context as string,
    feel: row.feel as string,
    score: row.score as number,
    followed: row.followed as string | null,
    followed_note: row.followed_note as string | null,
    current_state: row.current_state as string | null,
    next_plan: row.next_plan as string | null,
    next_offering_ids: references.listOf('next_offering_ids', row),
    check_in_date: row.check_in_date as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
