import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { stock_movements } from './stock-movements.schema.js';

/** Persistence for `app.stock_movements` — the shared app record reads and writes, on its table. */
export class StockMovementsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_movements,
      entity: 'stockMovement',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
