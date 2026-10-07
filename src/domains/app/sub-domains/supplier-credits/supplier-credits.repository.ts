import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { supplier_credits } from './supplier-credits.schema.js';

/** Persistence for `app.supplier_credits` — the shared app record reads and writes, on its table. */
export class SupplierCreditsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: supplier_credits,
      entity: 'supplierCredit',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
