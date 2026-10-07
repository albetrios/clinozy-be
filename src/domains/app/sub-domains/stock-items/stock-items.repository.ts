import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { stock_items } from './stock-items.schema.js';

/** Persistence for `app.stock_items` — the shared app record reads and writes, on its table. */
export class StockItemsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_items,
      entity: 'stockItem',
      searchColumns: ['name'],
      numberColumn: 'stock_item_number',
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
