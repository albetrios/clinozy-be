import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { visits } from './visits.schema.js';

/** Persistence for `app.visits` — the shared app record reads and writes, on its table. */
export class VisitsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: visits,
      entity: 'visit',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
