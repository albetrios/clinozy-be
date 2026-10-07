import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { day_close_events } from './day-close-events.schema.js';

/** Persistence for `app.day_close_events` — the shared app record reads and writes, on its table. */
export class DayCloseEventsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: day_close_events,
      entity: 'dayCloseEvent',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
