import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { PatientDiagnosisOutput } from './patient-diagnoses.types.js';

/** Shapes an `app.patient_diagnoses` row as the API returns it (routes-final 7.E.6). */
export function serializePatientDiagnosis({ row }: { row: BaseRecordRow }): PatientDiagnosisOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
