import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { task_owner_changes } from './task-owner-changes.schema.js';

/** Persistence for `app.task_owner_changes` — the shared app record reads and writes, on its table. */
export class TaskOwnerChangesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: task_owner_changes,
      entity: 'taskOwnerChange',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
