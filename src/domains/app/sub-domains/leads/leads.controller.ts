import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { LeadsService } from './leads.service.js';
import type { LeadOutput } from './leads.types.js';

/**
 * HTTP handlers for the `leads` routes — {@link BaseRecordController} on {@link LeadsService}: an
 * inline new `contact` on create needs `contact:create` too (5.4), the export needs `lead:read`
 * with its own `lead:export` gate (L4).
 */
export class LeadsController extends BaseRecordController<LeadOutput> {
  constructor(service: LeadsService) {
    super(service, {
      resource: 'lead',
      idParam: 'lead_id',
      readPermission: APP_PERMISSIONS.LEAD_READ,
      exportName: 'leads',
      guardedFields: { contact: APP_PERMISSIONS.CONTACT_CREATE },
    });
  }
}

/** The `leads` controller the routes register. */
export function createLeadsController(service: LeadsService): LeadsController {
  return new LeadsController(service);
}
