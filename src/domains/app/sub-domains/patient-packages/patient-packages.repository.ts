import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_packages } from './patient-packages.schema.js';

/** Persistence for `app.patient_packages` — the shared app record reads and writes, on its table. */
export class PatientPackagesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_packages,
      entity: 'patientPackage',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
