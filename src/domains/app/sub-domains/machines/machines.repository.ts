import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { machines } from './machines.schema.js';

/** Persistence for `app.machines` — the shared app record reads and writes, on its table. */
export class MachinesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: machines,
      entity: 'machine',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
