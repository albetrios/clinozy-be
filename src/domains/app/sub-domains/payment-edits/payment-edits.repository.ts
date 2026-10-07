import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { payment_edits } from './payment-edits.schema.js';

/** Persistence for `app.payment_edits` — the shared app record reads and writes, on its table. */
export class PaymentEditsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: payment_edits,
      entity: 'paymentEdit',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
