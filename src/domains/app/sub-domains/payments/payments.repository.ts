import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { payments } from './payments.schema.js';

/** Persistence for `app.payments` — the shared app record reads and writes, on its table. */
export class PaymentsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: payments,
      entity: 'payment',
      searchColumns: ['payee_name'],
      numberColumn: 'payment_number',
      sortColumns: { created_at: 'created_at', paid_at: 'created_at' },
      defaultSort: 'paid_at',
      defaultOrder: 'desc',
    });
  }
}
