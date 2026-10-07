import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_reports } from './patient-reports.schema.js';

/** Persistence for `app.patient_reports` — the shared app record reads and writes, on its table. */
export class PatientReportsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_reports,
      entity: 'patientReport',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', report_date: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
