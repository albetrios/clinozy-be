import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { medical_reps, medical_rep_manufacturers } from './medical-reps.schema.js';
import { manufacturers } from '@/domains/app/sub-domains/manufacturers/manufacturers.schema.js';

/** The `manufacturer_ids` link of a medical rep (`app.medical_rep_manufacturers`). */
export const MEDICAL_REP_MANUFACTURERS_LINK: BaseRecordLinkTable = {
  table: medical_rep_manufacturers,
  ownerColumn: 'medical_rep_id',
  targetColumn: 'manufacturer_id',
  targetTable: manufacturers,
};

/** Persistence for `app.medical_reps` — the shared app record reads and writes, on its table. */
export class MedicalRepsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medical_reps,
      entity: 'medicalRep',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text', next_visit_on: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
