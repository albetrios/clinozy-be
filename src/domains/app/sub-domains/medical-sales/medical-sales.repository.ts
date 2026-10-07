import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { medical_sales } from './medical-sales.schema.js';

/** Persistence for `app.medical_sales` — the shared app record reads and writes, on its table. */
export class MedicalSalesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medical_sales,
      entity: 'medicalSale',
      searchColumns: [],
      numberColumn: 'sale_number',
      sortColumns: { created_at: 'created_at', sold_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
