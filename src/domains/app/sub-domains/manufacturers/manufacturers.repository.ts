import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { manufacturers } from './manufacturers.schema.js';

/** Persistence for `app.manufacturers` — the shared app record reads and writes, on its table. */
export class ManufacturersRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: manufacturers,
      entity: 'manufacturer',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
