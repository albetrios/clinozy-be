import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { lead_reads } from './lead-reads.schema.js';

/** Persistence for `app.lead_reads` — the shared app record reads and writes, on its table. */
export class LeadReadsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: lead_reads,
      entity: 'leadRead',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
