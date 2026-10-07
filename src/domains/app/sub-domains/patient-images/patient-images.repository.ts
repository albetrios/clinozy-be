import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_images } from './patient-images.schema.js';

/** Persistence for `app.patient_images` — the shared app record reads and writes, on its table. */
export class PatientImagesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_images,
      entity: 'patientImage',
      searchColumns: ['file_name'],
      sortColumns: { created_at: 'created_at', taken_on: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
