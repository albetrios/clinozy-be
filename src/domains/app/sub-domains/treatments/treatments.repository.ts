import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { treatments } from './treatments.schema.js';

/** Persistence for `app.treatments` — the shared app record reads and writes, on its table. */
export class TreatmentsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: treatments,
      entity: 'treatment',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', performed_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
