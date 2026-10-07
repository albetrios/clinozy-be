import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { prescriptions } from './prescriptions.schema.js';

/** Persistence for `app.prescriptions` — the shared app record reads and writes, on its table. */
export class PrescriptionsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: prescriptions,
      entity: 'prescription',
      searchColumns: [],
      numberColumn: 'prescription_number',
      sortColumns: { created_at: 'created_at', prescription_date: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
