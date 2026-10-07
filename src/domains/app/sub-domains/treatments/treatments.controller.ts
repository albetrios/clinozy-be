import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { TreatmentsService } from './treatments.service.js';
import type { TreatmentOutput } from './treatments.types.js';

/** HTTP handlers for the `treatments` routes — {@link BaseRecordController} on {@link TreatmentsService}. */
export class TreatmentsController extends BaseRecordController<TreatmentOutput> {
  constructor(service: TreatmentsService) {
    super(service, { resource: 'treatment', idParam: 'treatment_id', parentParam: 'patient_id' });
  }
}

/** The `treatments` controller the routes register. */
export function createTreatmentsController(service: TreatmentsService): TreatmentsController {
  return new TreatmentsController(service);
}
