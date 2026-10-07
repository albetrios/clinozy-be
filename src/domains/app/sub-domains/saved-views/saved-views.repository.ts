import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { saved_views } from './saved-views.schema.js';

/** Persistence for `app.saved_views` — the shared app record reads and writes, on its table. */
export class SavedViewsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: saved_views,
      entity: 'savedView',
      searchColumns: ['label'],
      sortColumns: { created_at: 'created_at', label: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
