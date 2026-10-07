import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { message_templates } from './message-templates.schema.js';

/** Persistence for `app.message_templates` — the shared app record reads and writes, on its table. */
export class MessageTemplatesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: message_templates,
      entity: 'messageTemplate',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
