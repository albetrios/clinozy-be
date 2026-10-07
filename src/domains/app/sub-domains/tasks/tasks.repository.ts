import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { tasks } from './tasks.schema.js';

/** Persistence for `app.tasks` — the shared app record reads and writes, on its table. */
export class TasksRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: tasks,
      entity: 'task',
      searchColumns: ['title'],
      sortColumns: { created_at: 'created_at', due_at: 'created_at' },
      defaultSort: 'due_at',
      defaultOrder: 'asc',
    });
  }
}
