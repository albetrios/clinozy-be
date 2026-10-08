import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_prescriptions } from './patient-prescriptions.schema.js';

/**
 * Persistence for `app.patient_prescriptions` (launch ROUTE #133, routes-final 7.C) — the shared app
 * record reads and writes on its table: `q` is the prescription number (`RX-500`, `#500`), newest
 * first or by prescription date.
 */
export class PatientPrescriptionsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_prescriptions,
      entity: 'patientPrescription',
      searchColumns: [],
      numberColumn: 'prescription_number',
      sortColumns: { created_at: 'created_at', prescription_date: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
