import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { ContactsService } from './contacts.service.js';
import type { ContactOutput } from './contacts.types.js';

/** HTTP handlers for the `contacts` routes — {@link BaseRecordController} on {@link ContactsService}. */
export class ContactsController extends BaseRecordController<ContactOutput> {
  constructor(service: ContactsService) {
    super(service, {
      resource: 'contact',
      idParam: 'contact_id',
      readPermission: APP_PERMISSIONS.CONTACT_READ,
    });
  }
}

/** The `contacts` controller the routes register. */
export function createContactsController(service: ContactsService): ContactsController {
  return new ContactsController(service);
}
