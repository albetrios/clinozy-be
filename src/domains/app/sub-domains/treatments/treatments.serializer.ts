import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { TreatmentOutput } from './treatments.types.js';

/** Shapes a `app.treatments` row as the API returns it (public ids, numbers, ISO times). */
export function serializeTreatment(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): TreatmentOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    appointment_id: references.publicIdOf('appointment_id', row),
    offering_id: references.publicIdOf('offering_id', row),
    name: row.name as string,
    template: row.template as string,
    performed_at: toInstant(row.performed_at) as string,
    doctor_membership_id: references.publicIdOf('doctor_membership_id', row),
    therapist_membership_id: references.publicIdOf('therapist_membership_id', row),
    body_parts: row.body_parts as string[],
    session_number: row.session_number as number,
    parameters: row.parameters as unknown,
    remark: row.remark as string | null,
    aftercare_call: row.aftercare_call as string,
    patient_package_id: references.publicIdOf('patient_package_id', row),
    status: row.status as string,
    reversed_reason: row.reversed_reason as string | null,
    reversed_at: toInstant(row.reversed_at),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
