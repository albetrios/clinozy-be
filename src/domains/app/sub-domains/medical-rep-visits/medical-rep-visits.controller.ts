import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { MedicalRepVisitsService } from './medical-rep-visits.service.js';
import type { MedicalRepVisitOutput } from './medical-rep-visits.types.js';

/** HTTP handlers for the `medical-rep-visits` routes — {@link BaseRecordController} on {@link MedicalRepVisitsService}. */
export class MedicalRepVisitsController extends BaseRecordController<MedicalRepVisitOutput> {
  constructor(service: MedicalRepVisitsService) {
    super(service, {
      resource: 'medical_rep_visit',
      idParam: 'medical_rep_visit_id',
      parentParam: 'medical_rep_id',
    });
  }
}

/** The `medical-rep-visits` controller the routes register. */
export function createMedicalRepVisitsController(
  service: MedicalRepVisitsService,
): MedicalRepVisitsController {
  return new MedicalRepVisitsController(service);
}
