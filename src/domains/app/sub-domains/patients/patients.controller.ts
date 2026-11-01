import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import { PATIENT_MEDICAL_DETAIL_READERS } from './patients.constants.js';
import type { PatientsService } from './patients.service.js';
import type { PatientOutput } from './patients.types.js';

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
      // B1-3: a download with the medical cells needs a strong step-up; G2-3: reads are audited
      exportStepUpFields: ['allergies', 'contraindications', 'notes'],
      auditReads: true,
    });
  }
}

/** The `patients` controller the routes register. */
export function createPatientsController(service: PatientsService): PatientsController {
  return new PatientsController(service);
}
