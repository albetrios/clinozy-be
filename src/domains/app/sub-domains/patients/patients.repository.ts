import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patients } from './patients.schema.js';

/** Persistence for `app.patients` — the shared app record reads and writes, on its table. */
export class PatientsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patients,
      entity: 'patient',
      searchColumns: ['search_text'],
      numberColumn: 'patient_number',
      sortColumns: { created_at: 'created_at', first_name: 'text', follow_up_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
