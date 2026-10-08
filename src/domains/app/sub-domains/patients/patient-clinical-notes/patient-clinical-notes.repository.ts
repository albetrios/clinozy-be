import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_clinical_notes } from './patient-clinical-notes.schema.js';

/**
 * Persistence for `app.patient_clinical_notes` (launch ROUTE #133, routes-final 7.B) — the shared
 * app record reads and writes on its table: `q` on the text, newest first.
 */
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
