import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientsService } from './patients.service.js';
import type { PatientOutput } from './patients.types.js';

/**
 * Who sees a patient's medical details — the clinical team (`patient:clinical_record:read`: Doctor,
 * Therapist, Counsellor, Owner, Admin), whoever records them at intake (`patient:update`: the Front
 * desk) and whoever dispenses (`patient_prescription:read`: the Pharmacist). Any one is enough; the
 * Accountant and Marketing (`patient:read` only) see the name and the contact (launch D83 (3)).
 */
const PATIENT_MEDICAL_DETAIL_READERS = [
  APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ,
  APP_PERMISSIONS.PATIENT_UPDATE,
  APP_PERMISSIONS.PATIENT_PRESCRIPTION_READ,
] as const;

/**
 * HTTP handlers for the `patients` routes — {@link BaseRecordController} on {@link PatientsService}:
 * an inline new `contact` on create needs `contact:create` too (7.A.4), the export needs
 * `patient:read` with its own `patient:export` gate (P5), and the medical details — `allergies`,
 * `contraindications`, `notes` — are `null` (the export's cells blank) on every answer to a caller
 * holding none of {@link PATIENT_MEDICAL_DETAIL_READERS} (launch D83 (3)).
 */
export class PatientsController extends BaseRecordController<PatientOutput> {
  constructor(service: PatientsService) {
    super(service, {
      resource: 'patient',
      idParam: 'patient_id',
      readPermission: APP_PERMISSIONS.PATIENT_READ,
      exportName: 'patients',
      guardedFields: { contact: APP_PERMISSIONS.CONTACT_CREATE },
      hiddenFields: {
        allergies: PATIENT_MEDICAL_DETAIL_READERS,
        contraindications: PATIENT_MEDICAL_DETAIL_READERS,
        notes: PATIENT_MEDICAL_DETAIL_READERS,
      },
    });
  }
}

/** The `patients` controller the routes register. */
export function createPatientsController(service: PatientsService): PatientsController {
  return new PatientsController(service);
}
