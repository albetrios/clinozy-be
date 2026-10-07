import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { LeadsService } from './leads.service.js';
import type { LeadOutput } from './leads.types.js';

/** HTTP handlers for the `leads` routes — {@link BaseRecordController} on {@link LeadsService}. */
export class LeadsController extends BaseRecordController<LeadOutput> {
  constructor(service: LeadsService) {
    super(service, {
      resource: 'lead',
      idParam: 'lead_id',
      readPermission: APP_PERMISSIONS.LEAD_READ,
      exportName: 'leads',
    });
  }
}

/** The `leads` controller the routes register. */
export function createLeadsController(service: LeadsService): LeadsController {
  return new LeadsController(service);
}
