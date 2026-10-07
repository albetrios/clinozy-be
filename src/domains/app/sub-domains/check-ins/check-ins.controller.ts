import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { CheckInsService } from './check-ins.service.js';
import type { CheckInOutput } from './check-ins.types.js';

/** HTTP handlers for the `check-ins` routes — {@link BaseRecordController} on {@link CheckInsService}. */
export class CheckInsController extends BaseRecordController<CheckInOutput> {
  constructor(service: CheckInsService) {
    super(service, { resource: 'check_in', idParam: 'check_in_id', parentParam: 'patient_id' });
  }
}

/** The `check-ins` controller the routes register. */
export function createCheckInsController(service: CheckInsService): CheckInsController {
  return new CheckInsController(service);
}
