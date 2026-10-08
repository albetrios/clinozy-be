import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { PatientPackageOutput } from './patient-packages.types.js';

/** Shapes a `app.patient_packages` row as the API returns it (public ids, numbers, ISO times). */
export function serializePatientPackage(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientPackageOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    offering_id: references.publicIdOf('offering_id', row) ?? '',
    invoice_id: references.publicIdOf('invoice_id', row),
    sessions_total: row.sessions_total as number,
    sessions_used: row.sessions_used as number,
    valid_until: row.valid_until as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
