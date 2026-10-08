import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { ContactActivitiesService } from './contact-activities.service.js';
import type { ContactActivityOutput } from './contact-activities.types.js';

/**
 * HTTP handlers for a contact's stream — {@link BaseRecordController} on
 * {@link ContactActivitiesService}, nested under `contact_id`.
 */
export class ContactActivitiesController extends BaseRecordController<ContactActivityOutput> {
  constructor(service: ContactActivitiesService) {
    super(service, {
      resource: 'contact_activity',
      idParam: 'contact_activity_id',
      parentParam: 'contact_id',
    });
  }
}

/** The contact activities controller the routes register. */
export function createContactActivitiesController(
  service: ContactActivitiesService,
): ContactActivitiesController {
  return new ContactActivitiesController(service);
}
