import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientsService } from './patients.service.js';
import type { PatientOutput } from './patients.types.js';

/** HTTP handlers for the `patients` routes — {@link BaseRecordController} on {@link PatientsService}. */
export class PatientsController extends BaseRecordController<PatientOutput> {
  constructor(service: PatientsService) {
    super(service, {
      resource: 'patient',
      idParam: 'patient_id',
      readPermission: APP_PERMISSIONS.PATIENT_READ,
      exportName: 'patients',
    });
  }
}

/** The `patients` controller the routes register. */
export function createPatientsController(service: PatientsService): PatientsController {
  return new PatientsController(service);
}
