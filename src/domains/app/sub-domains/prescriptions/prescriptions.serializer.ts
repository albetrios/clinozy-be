import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { PrescriptionOutput } from './prescriptions.types.js';

/** Shapes a `app.prescriptions` row as the API returns it (public ids, numbers, ISO times). */
export function serializePrescription(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): PrescriptionOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    prescription_number: row.prescription_number as number,
    appointment_id: references.publicIdOf('appointment_id', row),
    doctor_membership_id: references.publicIdOf('doctor_membership_id', row) ?? '',
    prescription_date: row.prescription_date as string,
    items: row.items as unknown,
    advice: row.advice as string | null,
    lab_report: row.lab_report as string | null,
    procedure_today: row.procedure_today as string | null,
    follow_up_date: row.follow_up_date as string | null,
    status: row.status as string,
    approved_at: toInstant(row.approved_at),
    print_language: row.print_language as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
