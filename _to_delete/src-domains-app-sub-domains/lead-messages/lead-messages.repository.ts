import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { lead_messages } from './lead-messages.schema.js';

/** Persistence for `app.lead_messages` — the shared app record reads and writes, on its table. */
export class LeadMessagesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: lead_messages,
      entity: 'leadMessage',
      searchColumns: [],
      sortColumns: { created_at: 'created_at', sent_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'asc',
    });
  }
}
