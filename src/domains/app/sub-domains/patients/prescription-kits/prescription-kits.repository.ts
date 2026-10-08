import { and, eq, isNull } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { RECORD_DELETE_REASON } from '@/shared/constants/record-fields.constants.js';
import { prescription_kits } from './prescription-kits.schema.js';

/**
 * Persistence for `app.prescription_kits` (launch ROUTE #133, routes-final 7.D) — the shared app
 * record reads and writes on its table: `q` on the name, newest first or by name.
 */
export class PrescriptionKitsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: prescription_kits,
      entity: 'prescriptionKit',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /**
   * The leave step's kit part (K4, P17): a leaver's live kits are theirs alone — soft-deleted
   * (`not_needed`), so the purge erases them and a restored member can undo each.
   */
  async softDeleteForMembership(options: {
    organization_id: number;
    membership_id: number;
  }): Promise<void> {
    await getRequestDatabase()
      .update(prescription_kits)
      .set({ deleted_at: new Date(), delete_reason: RECORD_DELETE_REASON.NOT_NEEDED })
      .where(
        and(
          eq(prescription_kits.organization_id, options.organization_id),
          eq(prescription_kits.owner_membership_id, options.membership_id),
          isNull(prescription_kits.deleted_at),
        ),
      );
  }
}
