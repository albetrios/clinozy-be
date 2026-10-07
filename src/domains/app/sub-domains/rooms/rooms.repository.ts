import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { rooms } from './rooms.schema.js';

/** Persistence for `app.rooms` — the shared app record reads and writes, on its table. */
export class RoomsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: rooms,
      entity: 'room',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
