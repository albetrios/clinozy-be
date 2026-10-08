import { and, inArray, isNotNull } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patients } from './patients.schema.js';

/** Persistence for `app.patients` — the shared app record reads and writes, on its table. */
export class PatientsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patients,
      entity: 'patient',
      searchColumns: ['search_text'],
      numberColumn: 'patient_number',
      sortColumns: { created_at: 'created_at', first_name: 'text', follow_up_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /**
   * The contact each file is for (#132, D68), by the files' public ids — a file without one (made
   * before #133 rebuilds the patient file) is absent.
   */
  async findContactIds(publicIds: readonly string[]): Promise<Map<string, number>> {
    if (publicIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ public_id: patients.public_id, contact_id: patients.contact_id })
      .from(patients)
      .where(and(inArray(patients.public_id, [...publicIds]), isNotNull(patients.contact_id)));
    return new Map(rows.map((row) => [row.public_id, row.contact_id as number]));
  }
}
