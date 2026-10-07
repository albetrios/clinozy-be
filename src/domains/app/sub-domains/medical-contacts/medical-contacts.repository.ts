import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { medical_contacts } from './medical-contacts.schema.js';

/** Persistence for `app.medical_contacts` — the shared app record reads and writes, on its table. */
export class MedicalContactsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medical_contacts,
      entity: 'medicalContact',
      searchColumns: ['search_text'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
