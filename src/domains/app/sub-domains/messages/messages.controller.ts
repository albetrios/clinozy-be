import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { MessagesService } from './messages.service.js';
import type { MessageOutput } from './messages.types.js';

/** HTTP handlers for the `messages` routes — {@link BaseRecordController} on {@link MessagesService}. */
export class MessagesController extends BaseRecordController<MessageOutput> {
  constructor(service: MessagesService) {
    super(service, { resource: 'message', idParam: 'message_id' });
  }
}

/** The `messages` controller the routes register. */
export function createMessagesController(service: MessagesService): MessagesController {
  return new MessagesController(service);
}
