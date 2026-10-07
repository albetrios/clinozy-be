import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { diagnoses } from './diagnoses.schema.js';

/** Persistence for `app.diagnoses` — the shared app record reads and writes, on its table. */
export class DiagnosesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: diagnoses,
      entity: 'diagnosis',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
