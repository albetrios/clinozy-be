import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { medical_rep_visits } from './medical-rep-visits.schema.js';

/** Persistence for `app.medical_rep_visits` — the shared app record reads and writes, on its table. */
export class MedicalRepVisitsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medical_rep_visits,
      entity: 'medicalRepVisit',
      searchColumns: [],
      sortColumns: { created_at: 'created_at', visit_date: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
