import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { OfferingGroupsService } from './offering-groups.service.js';
import type { OfferingGroupOutput } from './offering-groups.types.js';

/** HTTP handlers for the `offering-groups` routes — {@link BaseRecordController} on {@link OfferingGroupsService}. */
export class OfferingGroupsController extends BaseRecordController<OfferingGroupOutput> {
  constructor(service: OfferingGroupsService) {
    super(service, { resource: 'offering_group', idParam: 'offering_group_id' });
  }
}

/** The `offering-groups` controller the routes register. */
export function createOfferingGroupsController(
  service: OfferingGroupsService,
): OfferingGroupsController {
  return new OfferingGroupsController(service);
}
