import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { medical_rep_visits } from './medical-rep-visits.schema.js';

/**
 * Persistence for `app.medical_rep_visits` (launch ROUTE #153, routes-final 11.G) — the shared app
 * record reads and writes, nested under the MR.
 *
 * @remarks
 * - **Algorithm:** sorts `visit_date` (newest first, the default) and `created_at`.
 */
export class MedicalRepVisitsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medical_rep_visits,
      entity: 'medicalRepVisit',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      sortKeys: { visit_date: { keys: [{ value: 'visit_date' }], defaultOrder: 'desc' } },
      defaultSort: 'visit_date',
      defaultOrder: 'desc',
    });
  }
}
