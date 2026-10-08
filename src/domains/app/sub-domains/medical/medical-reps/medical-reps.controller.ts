import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { MedicalRepsService } from './medical-reps.service.js';
import type { MedicalRepOutput } from './medical-reps.types.js';

/** HTTP handlers for the `medical-reps` routes — {@link BaseRecordController} on {@link MedicalRepsService}. */
export class MedicalRepsController extends BaseRecordController<MedicalRepOutput> {
  constructor(service: MedicalRepsService) {
    super(service, {
      resource: 'medical_rep',
      idParam: 'medical_rep_id',
      readPermission: APP_PERMISSIONS.MEDICINE_READ,
    });
  }
}

/** The `medical-reps` controller the routes register. */
export function createMedicalRepsController(service: MedicalRepsService): MedicalRepsController {
  return new MedicalRepsController(service);
}
