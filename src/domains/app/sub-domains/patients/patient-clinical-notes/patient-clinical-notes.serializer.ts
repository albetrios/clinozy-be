import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { PatientClinicalNoteOutput } from './patient-clinical-notes.types.js';

/** Shapes an `app.patient_clinical_notes` row as the API returns it (routes-final 7.B.6). */
export function serializePatientClinicalNote({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): PatientClinicalNoteOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf({ field: 'patient_id', row }) ?? '',
    kind: row.kind as string,
    text: row.text as string,
    appointment_id: references.publicIdOf({ field: 'appointment_id', row }),
    patient_diagnosis_id: references.publicIdOf({ field: 'patient_diagnosis_id', row }),
    added_at: toInstant(row.added_at) as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
