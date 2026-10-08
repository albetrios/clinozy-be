import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { PatientReportOutput } from './patient-reports.types.js';

/** Shapes an `app.patient_reports` row as the API returns it (routes-final 7.G.6). */
export function serializePatientReport(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientReportOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    type: row.type as string,
    name: row.name as string,
    report_date: row.report_date as string,
    file_keys: row.file_keys as string[],
    notes: row.notes as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
