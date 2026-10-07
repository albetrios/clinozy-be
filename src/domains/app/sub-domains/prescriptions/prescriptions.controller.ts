import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PrescriptionsService } from './prescriptions.service.js';
import type { PrescriptionOutput } from './prescriptions.types.js';

/** HTTP handlers for the `prescriptions` routes — {@link BaseRecordController} on {@link PrescriptionsService}. */
export class PrescriptionsController extends BaseRecordController<PrescriptionOutput> {
  constructor(service: PrescriptionsService) {
    super(service, {
      resource: 'prescription',
      idParam: 'prescription_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `prescriptions` controller the routes register. */
export function createPrescriptionsController(
  service: PrescriptionsService,
): PrescriptionsController {
  return new PrescriptionsController(service);
}
