import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { PatientPrescriptionLine } from './patient-prescriptions.dto.js';
import type { PatientPrescriptionOutput } from './patient-prescriptions.types.js';

/** Shapes an `app.patient_prescriptions` row as the API returns it (routes-final 7.C.6). */
export function serializePatientPrescription({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): PatientPrescriptionOutput {
  return {
    id: row.public_id,
    prescription_number: row.prescription_number as number,
    patient_id: references.publicIdOf({ field: 'patient_id', row }) ?? '',
    appointment_id: references.publicIdOf({ field: 'appointment_id', row }),
    doctor_membership_id: references.publicIdOf({ field: 'doctor_membership_id', row }) ?? '',
    prescription_date: row.prescription_date as string,
    items: row.items as PatientPrescriptionLine[],
    advice: row.advice as string | null,
    lab_report: row.lab_report as string | null,
    procedure_today: row.procedure_today as string | null,
    follow_up_date: row.follow_up_date as string | null,
    print_language: row.print_language as string,
    status: row.status as string,
    approved_at: toInstant(row.approved_at),
    approved_by_membership_id: references.publicIdOf({ field: 'approved_by_membership_id', row }),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
