import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_diagnoses } from './patient-diagnoses.schema.js';

/**
 * Persistence for `app.patient_diagnoses` (launch ROUTE #133, routes-final 7.E) — the shared app
 * record reads and writes on its table: `q` on the name, by name by default.
 */
export class PatientDiagnosesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_diagnoses,
      entity: 'patientDiagnosis',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'name',
      defaultOrder: 'asc',
    });
  }
}
