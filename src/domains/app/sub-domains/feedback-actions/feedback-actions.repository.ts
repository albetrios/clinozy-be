import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { feedback_actions } from './feedback-actions.schema.js';

/** Persistence for `app.feedback_actions` — the shared app record reads and writes, on its table. */
export class FeedbackActionsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: feedback_actions,
      entity: 'feedbackAction',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
