import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { MessageTemplatesService } from './message-templates.service.js';
import type { MessageTemplateOutput } from './message-templates.types.js';

/** HTTP handlers for the `message-templates` routes — {@link BaseRecordController} on {@link MessageTemplatesService}. */
export class MessageTemplatesController extends BaseRecordController<MessageTemplateOutput> {
  constructor(service: MessageTemplatesService) {
    super(service, { resource: 'message_template', idParam: 'message_template_id' });
  }
}

/** The `message-templates` controller the routes register. */
export function createMessageTemplatesController(
  service: MessageTemplatesService,
): MessageTemplatesController {
  return new MessageTemplatesController(service);
}
