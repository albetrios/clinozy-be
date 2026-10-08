import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { patientFileValueLabel } from '@/domains/app/sub-domains/patients/patients.constants.js';
import {
  assertAppointmentOfPatient,
  writePatientFileActivity,
} from '@/domains/app/sub-domains/patients/patients.rules.js';

/**
 * The clinical notes rules (launch ROUTE #133, routes-final 7.B): the visit is the patient's, and
 * a new note shows in the contact's activity.
 *
 * @remarks
 * - **Algorithm:** a create's `appointment_id` must be an appointment of the patient's contact
 *   (TR3); after it, a `system` entry linked to the note joins the contact's activity — shown only
 *   to `patient:clinical_record:read` holders (7.10, M10).
 * - **Failure modes:** `ValidationError` on `appointment_id`.
 */
export const patientClinicalNotesRules: BaseRecordRules = {
  prepareCreate: async (values) => {
    await assertAppointmentOfPatient({
      appointmentId: values.appointment_id,
      patientId: values.patient_id as number,
    });
  },
  afterWrite: async (row, change, context) => {
    if (change.kind !== 'create') return;
    await writePatientFileActivity({
      context,
      patientId: row.patient_id as number,
      body: `Clinical note added: ${patientFileValueLabel(String(row.kind))}`,
      link: { patient_clinical_note_id: row.id },
    });
  },
};
