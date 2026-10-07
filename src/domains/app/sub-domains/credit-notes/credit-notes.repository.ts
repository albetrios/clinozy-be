import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { credit_notes } from './credit-notes.schema.js';

/** Persistence for `app.credit_notes` — the shared app record reads and writes, on its table. */
export class CreditNotesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: credit_notes,
      entity: 'creditNote',
      searchColumns: [],
      numberColumn: 'credit_note_number',
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
