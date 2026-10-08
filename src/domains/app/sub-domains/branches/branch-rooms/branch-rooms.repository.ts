import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { branch_rooms } from './branch-rooms.schema.js';

/** Persistence for `app.branch_rooms` — the shared app record reads and writes, on its table. */
export class BranchRoomsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: branch_rooms,
      entity: 'room',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
