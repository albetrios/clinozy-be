import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PrescriptionKitsService } from './prescription-kits.service.js';
import type { PrescriptionKitOutput } from './prescription-kits.types.js';

/** HTTP handlers for the `prescription-kits` routes — {@link BaseRecordController} on {@link PrescriptionKitsService}. */
export class PrescriptionKitsController extends BaseRecordController<PrescriptionKitOutput> {
  constructor(service: PrescriptionKitsService) {
    super(service, { resource: 'prescription_kit', idParam: 'prescription_kit_id' });
  }
}

/** The `prescription-kits` controller the routes register. */
export function createPrescriptionKitsController(
  service: PrescriptionKitsService,
): PrescriptionKitsController {
  return new PrescriptionKitsController(service);
}
