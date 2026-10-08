import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { PatientOutput } from './patients.types.js';

/** Shapes an `app.patients` row as the API returns it (routes-final 7.A.6): public ids and ISO times. */
export function serializePatient(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientOutput {
  return {
    id: row.public_id,
    patient_number: row.patient_number as number,
    contact_id: references.publicIdOf('contact_id', row) ?? '',
    home_branch_id: references.publicIdOf('home_branch_id', row) ?? '',
    types: row.types as string[],
    status: row.status as string,
    conversion: row.conversion as string,
    doctor_membership_id: references.publicIdOf('doctor_membership_id', row),
    follow_up_at: toInstant(row.follow_up_at),
    notes: row.notes as string | null,
    lead_id: references.publicIdOf('lead_id', row),
    has_data_consent: row.has_data_consent as boolean,
    has_photo_consent: row.has_photo_consent as boolean,
    allergies: row.allergies as string[],
    contraindications: row.contraindications as string[],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
