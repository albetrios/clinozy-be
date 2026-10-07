import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { day_closes } from './day-closes.schema.js';

/** Persistence for `app.day_closes` — the shared app record reads and writes, on its table. */
export class DayClosesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: day_closes,
      entity: 'dayClose',
      searchColumns: [],
      sortColumns: { created_at: 'created_at', close_date: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
