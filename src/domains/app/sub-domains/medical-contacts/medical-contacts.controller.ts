import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { MedicalContactsService } from './medical-contacts.service.js';
import type { MedicalContactOutput } from './medical-contacts.types.js';

/** HTTP handlers for the `medical-contacts` routes — {@link BaseRecordController} on {@link MedicalContactsService}. */
export class MedicalContactsController extends BaseRecordController<MedicalContactOutput> {
  constructor(service: MedicalContactsService) {
    super(service, { resource: 'medical_contact', idParam: 'medical_contact_id' });
  }
}

/** The `medical-contacts` controller the routes register. */
export function createMedicalContactsController(
  service: MedicalContactsService,
): MedicalContactsController {
  return new MedicalContactsController(service);
}
