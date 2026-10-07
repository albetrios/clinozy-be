import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { stock_purchases } from './stock-purchases.schema.js';

/** Persistence for `app.stock_purchases` — the shared app record reads and writes, on its table. */
export class StockPurchasesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_purchases,
      entity: 'stockPurchase',
      searchColumns: ['bill_number'],
      numberColumn: 'stock_purchase_number',
      sortColumns: { created_at: 'created_at', purchase_date: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
