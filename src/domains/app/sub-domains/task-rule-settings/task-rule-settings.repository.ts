import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { task_rule_settings } from './task-rule-settings.schema.js';

/** Persistence for `app.task_rule_settings` — the shared app record reads and writes, on its table. */
export class TaskRuleSettingsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: task_rule_settings,
      entity: 'taskRuleSetting',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
