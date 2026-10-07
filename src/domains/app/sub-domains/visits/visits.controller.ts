import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { VisitsService } from './visits.service.js';
import type { VisitOutput } from './visits.types.js';

/** HTTP handlers for the `visits` routes — {@link BaseRecordController} on {@link VisitsService}. */
export class VisitsController extends BaseRecordController<VisitOutput> {
  constructor(service: VisitsService) {
    super(service, { resource: 'visit', idParam: 'visit_id' });
  }
}

/** The `visits` controller the routes register. */
export function createVisitsController(service: VisitsService): VisitsController {
  return new VisitsController(service);
}
