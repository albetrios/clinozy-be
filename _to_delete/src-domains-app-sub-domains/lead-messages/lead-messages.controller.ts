import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { LeadMessagesService } from './lead-messages.service.js';
import type { LeadMessageOutput } from './lead-messages.types.js';

/** HTTP handlers for the `lead-messages` routes — {@link BaseRecordController} on {@link LeadMessagesService}. */
export class LeadMessagesController extends BaseRecordController<LeadMessageOutput> {
  constructor(service: LeadMessagesService) {
    super(service, {
      resource: 'lead_message',
      idParam: 'lead_message_id',
      parentParam: 'lead_id',
    });
  }
}

/** The `lead-messages` controller the routes register. */
export function createLeadMessagesController(service: LeadMessagesService): LeadMessagesController {
  return new LeadMessagesController(service);
}
