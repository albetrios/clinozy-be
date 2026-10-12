import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { branch_machines } from './branch-machines.schema.js';

/** Persistence for `app.branch_machines` — the shared app record reads and writes, on its table. */
export class BranchMachinesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: branch_machines,
      entity: 'machine',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
