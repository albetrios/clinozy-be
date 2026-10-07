import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { stock_counts } from './stock-counts.schema.js';

/** Persistence for `app.stock_counts` — the shared app record reads and writes, on its table. */
export class StockCountsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_counts,
      entity: 'stockCount',
      searchColumns: [],
      sortColumns: { created_at: 'created_at', counted_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
