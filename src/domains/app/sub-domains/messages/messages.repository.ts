import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { messages } from './messages.schema.js';

/** Persistence for `app.messages` — the shared app record reads and writes, on its table. */
export class MessagesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: messages,
      entity: 'message',
      searchColumns: ['body'],
      sortColumns: { created_at: 'created_at', sent_at: 'created_at' },
      defaultSort: 'sent_at',
      defaultOrder: 'asc',
    });
  }
}
