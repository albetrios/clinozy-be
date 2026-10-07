import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { branch_holidays } from './branch-holidays.schema.js';

/** Persistence for `app.branch_holidays` — the shared app record reads and writes, on its table. */
export class BranchHolidaysRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: branch_holidays,
      entity: 'branchHoliday',
      searchColumns: ['label'],
      sortColumns: { created_at: 'created_at', holiday_date: 'text' },
      defaultSort: 'holiday_date',
      defaultOrder: 'asc',
    });
  }
}
