import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_reports } from './patient-reports.schema.js';

/**
 * Persistence for `app.patient_reports` (launch ROUTE #133, routes-final 7.G) — the shared app record
 * reads and writes on its table: `q` on the name, newest report date first.
 */
export class PatientReportsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_reports,
      entity: 'patientReport',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', report_date: 'text' },
      defaultSort: 'report_date',
      defaultOrder: 'desc',
    });
  }
}
