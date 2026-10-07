import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_notes } from './patient-notes.schema.js';

/** Persistence for `app.patient_notes` — the shared app record reads and writes, on its table. */
export class PatientNotesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_notes,
      entity: 'patientNote',
      searchColumns: ['body'],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
