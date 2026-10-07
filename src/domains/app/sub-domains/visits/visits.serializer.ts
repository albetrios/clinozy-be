import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { VisitOutput } from './visits.types.js';

/** Shapes a `app.visits` row as the API returns it (public ids, numbers, ISO times). */
export function serializeVisit(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): VisitOutput {
  return {
    id: row.public_id,
    appointment_id: references.publicIdOf('appointment_id', row) ?? '',
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    stage: row.stage as string,
    stage_changed_at: toInstant(row.stage_changed_at) as string,
    started_at: toInstant(row.started_at) as string,
    paused_at: toInstant(row.paused_at),
    completed_at: toInstant(row.completed_at),
    last_saved_at: toInstant(row.last_saved_at),
    consult_complaint: row.consult_complaint as string | null,
    consult_findings: row.consult_findings as string | null,
    consult_plan: row.consult_plan as string | null,
    diagnoses: row.diagnoses as string[],
    is_safety_consent_checked: row.is_safety_consent_checked as boolean,
    is_safety_before_photos_taken: row.is_safety_before_photos_taken as boolean,
    is_safety_allergies_checked: row.is_safety_allergies_checked as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
