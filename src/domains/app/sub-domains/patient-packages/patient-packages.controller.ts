import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientPackagesService } from './patient-packages.service.js';
import type { PatientPackageOutput } from './patient-packages.types.js';

/** HTTP handlers for the `patient-packages` routes — {@link BaseRecordController} on {@link PatientPackagesService}. */
export class PatientPackagesController extends BaseRecordController<PatientPackageOutput> {
  constructor(service: PatientPackagesService) {
    super(service, {
      resource: 'patient_package',
      idParam: 'patient_package_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-packages` controller the routes register. */
export function createPatientPackagesController(
  service: PatientPackagesService,
): PatientPackagesController {
  return new PatientPackagesController(service);
}
