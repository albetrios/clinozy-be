import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { PatientNoteOutput } from './patient-notes.types.js';

/** Shapes a `app.patient_notes` row as the API returns it (public ids, numbers, ISO times). */
export function serializePatientNote(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientNoteOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    body: row.body as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
