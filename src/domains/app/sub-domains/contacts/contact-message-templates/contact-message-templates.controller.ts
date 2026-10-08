import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { ContactMessageTemplatesService } from './contact-message-templates.service.js';
import type { ContactMessageTemplateOutput } from './contact-message-templates.types.js';

/** HTTP handlers for the `contact-message-templates` routes — {@link BaseRecordController}. */
export class ContactMessageTemplatesController extends BaseRecordController<ContactMessageTemplateOutput> {
  constructor(service: ContactMessageTemplatesService) {
    super(service, {
      resource: 'contact_message_template',
      idParam: 'contact_message_template_id',
    });
  }
}

/** The `contact-message-templates` controller the routes register. */
export function createContactMessageTemplatesController(
  service: ContactMessageTemplatesService,
): ContactMessageTemplatesController {
  return new ContactMessageTemplatesController(service);
}
