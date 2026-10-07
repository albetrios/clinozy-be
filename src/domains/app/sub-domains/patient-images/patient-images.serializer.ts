import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { PatientImageOutput } from './patient-images.types.js';

/** Shapes a `app.patient_images` row as the API returns it (public ids, numbers, ISO times). */
export function serializePatientImage(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientImageOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    appointment_id: references.publicIdOf('appointment_id', row),
    album: row.album as string,
    file_key: row.file_key as string,
    file_name: row.file_name as string,
    body_part: row.body_part as string | null,
    taken_on: row.taken_on as string,
    caption: row.caption as string | null,
    display_name: row.display_name as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
