import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { contact_message_templates } from './contact-message-templates.schema.js';

/**
 * Persistence for `app.contact_message_templates` — the shared app record reads and writes on its
 * table; `q` matches the name; newest first by default (routes-final 4.D.8).
 */
export class ContactMessageTemplatesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: contact_message_templates,
      entity: 'contactMessageTemplate',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
