import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { pending_credits } from './pending-credits.schema.js';

/** Persistence for `app.pending_credits` — the shared app record reads and writes, on its table. */
export class PendingCreditsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: pending_credits,
      entity: 'pendingCredit',
      searchColumns: ['party_name'],
      numberColumn: 'pending_credit_number',
      sortColumns: { created_at: 'created_at', settle_by: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
