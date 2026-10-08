import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { PatientImageOutput } from './patient-images.types.js';

/**
 * Shapes an `app.patient_images` row as the API returns it (routes-final 7.F.6). `service_label`
 * is the rules' `decorate` (one read per page) — empty here.
 */
export function serializePatientImage(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientImageOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    appointment_id: references.publicIdOf('appointment_id', row),
    patient_treatment_id: references.publicIdOf('patient_treatment_id', row),
    album: row.album as string,
    stage: row.stage as string | null,
    file_key: row.file_key as string,
    file_name: row.file_name as string,
    display_name: row.display_name as string | null,
    caption: row.caption as string | null,
    body_part: row.body_part as string | null,
    taken_on: row.taken_on as string,
    service_label: null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
