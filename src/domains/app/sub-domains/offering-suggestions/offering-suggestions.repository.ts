import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { offering_suggestions } from './offering-suggestions.schema.js';

/** Persistence for `app.offering_suggestions` — the shared app record reads and writes, on its table. */
export class OfferingSuggestionsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: offering_suggestions,
      entity: 'offeringSuggestion',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
