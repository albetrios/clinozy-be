import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { PatientClinicalNoteOutput } from './patient-clinical-notes.types.js';

/** Shapes a `app.patient_clinical_notes` row as the API returns it (public ids, numbers, ISO times). */
export function serializePatientClinicalNote(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientClinicalNoteOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    kind: row.kind as string,
    text: row.text as string,
    added_at: toInstant(row.added_at) as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
