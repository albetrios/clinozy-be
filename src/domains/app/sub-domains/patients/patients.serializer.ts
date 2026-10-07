import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { PatientOutput } from './patients.types.js';

/** Shapes a `app.patients` row as the API returns it (public ids, numbers, ISO times). */
export function serializePatient(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PatientOutput {
  return {
    id: row.public_id,
    patient_number: row.patient_number as number,
    first_name: row.first_name as string,
    last_name: row.last_name as string | null,
    phone: row.phone as string,
    phones: row.phones as string[],
    email: row.email as string | null,
    gender: row.gender as string | null,
    date_of_birth: row.date_of_birth as string | null,
    address: row.address as string | null,
    home_branch_id: references.publicIdOf('home_branch_id', row) ?? '',
    types: row.types as string[],
    status: row.status as string,
    conversion: row.conversion as string,
    referral_source: row.referral_source as string | null,
    referred_by_patient_id: references.publicIdOf('referred_by_patient_id', row),
    referred_by_name: row.referred_by_name as string | null,
    doctor_membership_id: references.publicIdOf('doctor_membership_id', row),
    follow_up_at: toInstant(row.follow_up_at),
    notes: row.notes as string | null,
    lead_id: references.publicIdOf('lead_id', row),
    has_data_consent: row.has_data_consent as boolean,
    has_photo_consent: row.has_photo_consent as boolean,
    has_marketing_consent: row.has_marketing_consent as boolean,
    language: row.language as string | null,
    instagram_handles: row.instagram_handles as string[],
    default_channel: row.default_channel as string | null,
    preferences: row.preferences as unknown,
    household: row.household as string | null,
    allergies: row.allergies as string[],
    contraindications: row.contraindications as string[],
    last_visit_on: null,
    next_visit_on: null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
