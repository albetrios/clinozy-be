import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_clinical_notes } from './patient-clinical-notes.schema.js';

/** Persistence for `app.patient_clinical_notes` — the shared app record reads and writes, on its table. */
export class PatientClinicalNotesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_clinical_notes,
      entity: 'patientClinicalNote',
      searchColumns: ['text'],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
