import { and, isNotNull, sql } from 'drizzle-orm';
import { deleteInBatchesByCondition } from '@/infrastructure/database/utils/batch-delete.util.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { APP_RECORD_TABLES } from '@/domains/app/app-record-tables.js';
import { columnOf } from '@/domains/app/base-record.repository.js';
import { ORGANIZATION_SETTINGS_DEFAULT_DELETED_RECORD_PURGE_DAYS } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.constants.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Erases deleted app records for good once their organization's restore window has passed
 * (WC-46, D38) — every `app.*` table, children before parents.
 *
 * @remarks
 * - **Algorithm:** for each table of {@link APP_RECORD_TABLES}, batch-deletes the rows whose
 *   `deleted_at` is older than the organization's `deleted_record_purge_days` (the clinic
 *   setting; 7 days when unset). Live rows never match.
 * - **Failure modes:** a deleted row still named by a live record (a no-action foreign key) is
 *   skipped and counted as blocked, and tried again the next day; any other database error
 *   propagates so BullMQ retries.
 * - **Side effects:** DELETEs on the `app.*` tables; link-table rows go with their owner
 *   (`ON DELETE CASCADE`).
 * - **Notes:** runs under the global retention cleanup context — the `app.*` policies' bypass arm
 *   lets it read every organization's rows.
 */
export async function runAppRecordPurgeJob(databaseHandle: WorkerDatabaseHandle): Promise<{
  deletedCount: number;
  blockedCount: number;
}> {
  let deletedCount = 0;
  let blockedCount = 0;
  for (const { table, label } of APP_RECORD_TABLES) {
    const deletedAt = columnOf(table, 'deleted_at');
    const organizationId = columnOf(table, 'organization_id');
    const result = await deleteInBatchesByCondition({
      databaseHandle,
      table,
      idColumn: columnOf(table, 'id'),
      whereCondition: and(
        isNotNull(deletedAt),
        // A sargable floor for the deleted_at index: every window is at least one day.
        sql`${deletedAt} < now() - interval '1 day'`,
        sql`${deletedAt} < now() - make_interval(days => COALESCE((
          SELECT ${organization_settings.deleted_record_purge_days}
          FROM ${organization_settings}
          WHERE ${organization_settings.organization_id} = ${organizationId}
        ), ${ORGANIZATION_SETTINGS_DEFAULT_DELETED_RECORD_PURGE_DAYS}))`,
      )!,
      logContext: 'app-record-purge',
      tableLabel: label,
    });
    deletedCount += result.deletedCount;
    blockedCount += result.blockedCount;
  }
  logger.info({ deletedCount, blockedCount }, 'app-record-purge.completed');
  return { deletedCount, blockedCount };
}
