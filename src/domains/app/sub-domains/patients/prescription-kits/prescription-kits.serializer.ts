import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { PatientPrescriptionLine } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.dto.js';
import type { PrescriptionKitOutput } from './prescription-kits.types.js';

/** Shapes an `app.prescription_kits` row as the API returns it (routes-final 7.D.6). */
export function serializePrescriptionKit(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PrescriptionKitOutput {
  return {
    id: row.public_id,
    owner_membership_id: references.publicIdOf('owner_membership_id', row) ?? '',
    name: row.name as string,
    items: row.items as PatientPrescriptionLine[],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
