import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { prescription_kits } from './prescription-kits.schema.js';

/** Persistence for `app.prescription_kits` — the shared app record reads and writes, on its table. */
export class PrescriptionKitsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: prescription_kits,
      entity: 'prescriptionKit',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
