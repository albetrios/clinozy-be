import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { stock_vendors } from './stock-vendors.schema.js';

/** Persistence for `app.stock_vendors` — the shared app record reads and writes, on its table. */
export class StockVendorsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_vendors,
      entity: 'stockVendor',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
