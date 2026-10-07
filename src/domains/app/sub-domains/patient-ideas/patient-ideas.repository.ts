import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_ideas } from './patient-ideas.schema.js';

/** Persistence for `app.patient_ideas` — the shared app record reads and writes, on its table. */
export class PatientIdeasRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_ideas,
      entity: 'patientIdea',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
