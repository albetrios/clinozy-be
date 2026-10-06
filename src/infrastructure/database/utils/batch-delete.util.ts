import { and, asc, eq, gt, inArray, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';
import type { PostgresDatabaseHandle } from '@/infrastructure/database/utils/database-handle.types.js';
import { isPostgresForeignKeyViolation } from '@/shared/utils/infrastructure/postgres-error.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

const DEFAULT_BATCH_SIZE = 5_000;

/**
 * Most batches one run deletes — 250 000 rows at the default batch size. Every caller runs inside
 * one retention transaction, so the cap bounds how long that transaction holds its locks and how
 * much WAL it writes in one go; a larger backlog continues on the next run.
 */
export const BATCH_DELETE_MAX_BATCHES_PER_RUN = 50;

/**
 * Outcome of {@link deleteInBatchesByCondition}: rows actually removed, rows skipped because a
 * foreign-key constraint blocked their per-row fallback delete, and whether the run stopped at
 * its batch cap with rows still left for the next run.
 */
export interface BatchDeleteResult {
  deletedCount: number;
  blockedCount: number;
  hasMore: boolean;
}

async function deleteRowsIndividually(options: {
  databaseHandle: PostgresDatabaseHandle;
  table: AnyPgTable;
  idColumn: AnyPgColumn;
  identifiers: ReadonlyArray<number | string>;
  logContext: string | undefined;
  tableLabel: string | undefined;
}): Promise<Omit<BatchDeleteResult, 'hasMore'>> {
  const { databaseHandle, table, idColumn, identifiers, logContext, tableLabel } = options;
  let deletedCount = 0;
  let blockedCount = 0;
  for (const identifier of identifiers) {
    try {
      // A savepoint per row: inside the caller's transaction, a failed statement would otherwise
      // abort the transaction and fail every row after it (SQLSTATE 25P02).
      await databaseHandle.transaction((savepoint) =>
        savepoint.delete(table).where(eq(idColumn, identifier)),
      );
      deletedCount += 1;
    } catch (rowError) {
      if (!isPostgresForeignKeyViolation(rowError)) {
        throw rowError;
      }
      blockedCount += 1;
      logger.warn({ logContext, tableLabel, identifier }, 'batch-delete.fkBlocked');
    }
  }
  return { deletedCount, blockedCount };
}

/**
 * Deletes rows matching `whereCondition` in batches to avoid unbounded RETURNING payloads
 * and long idle-in-transaction windows on retention workers.
 *
 * @remarks
 * - **Algorithm:** keyset-paged on `idColumn` (ascending), so FK-blocked rows — which remain in the
 *   table and keep matching `whereCondition` — are scanned once and then skipped: one forward pass,
 *   even when a whole batch is permanently blocked. On a foreign-key violation the batch falls back
 *   to per-row deletes and counts the blocked rows. Each delete runs in a savepoint, so inside the
 *   caller's retention transaction a blocked row is skipped instead of aborting the run — before,
 *   one row an inviter's invitation still referenced failed `user-tombstone-retention` every night.
 * - **Failure modes:** any error but a foreign-key violation propagates.
 * - **Side effects:** deletes rows; stops after `maxBatches` with `hasMore: true`, leaving the rest
 *   for the next run.
 * - **Notes:** callers pass an explicit `databaseHandle` (from `connection.ts` or a worker context
 *   wrapper).
 */
export async function deleteInBatchesByCondition(options: {
  databaseHandle: PostgresDatabaseHandle;
  table: AnyPgTable;
  idColumn: AnyPgColumn;
  whereCondition: SQL;
  batchSize?: number;
  /** Most batches this run deletes; defaults to {@link BATCH_DELETE_MAX_BATCHES_PER_RUN}. */
  maxBatches?: number;
  /** Included in FK-blocked logs when per-row delete fails. */
  logContext?: string;
  tableLabel?: string;
}): Promise<BatchDeleteResult> {
  const {
    databaseHandle,
    table,
    idColumn,
    whereCondition,
    batchSize = DEFAULT_BATCH_SIZE,
    maxBatches = BATCH_DELETE_MAX_BATCHES_PER_RUN,
    logContext,
    tableLabel,
  } = options;
  let deletedCount = 0;
  let blockedCount = 0;
  let batchCount = 0;
  // Keyset cursor on `idColumn`. FK-blocked rows stay in the table and keep matching
  // `whereCondition`; without paging past them, a full batch (>= batchSize) of permanently-blocked
  // rows would be re-selected every iteration and the loop would never terminate. Advancing the
  // cursor past every scanned id guarantees a single forward pass.
  let cursor: number | string | undefined;

  for (;;) {
    if (batchCount >= maxBatches) {
      logger.info({ logContext, tableLabel, deletedCount, maxBatches }, 'batch-delete.run_capped');
      return { deletedCount, blockedCount, hasMore: true };
    }
    batchCount += 1;
    const scanCondition =
      cursor === undefined ? whereCondition : and(whereCondition, gt(idColumn, cursor));
    const batchIds = await databaseHandle
      .select({ id: idColumn })
      .from(table)
      .where(scanCondition)
      .orderBy(asc(idColumn))
      .limit(batchSize);

    if (batchIds.length === 0) {
      break;
    }

    const identifiers = batchIds.map((row) => row.id as number | string);
    // Advance the cursor to the highest id scanned BEFORE deleting, so blocked rows (which remain)
    // are excluded from the next scan.
    cursor = identifiers[identifiers.length - 1];

    try {
      await databaseHandle.transaction((savepoint) =>
        savepoint.delete(table).where(inArray(idColumn, identifiers)),
      );
      deletedCount += identifiers.length;
    } catch (error) {
      if (!isPostgresForeignKeyViolation(error)) {
        throw error;
      }
      const perRow = await deleteRowsIndividually({
        databaseHandle,
        table,
        idColumn,
        identifiers,
        logContext,
        tableLabel,
      });
      deletedCount += perRow.deletedCount;
      blockedCount += perRow.blockedCount;
    }

    if (batchIds.length < batchSize) {
      break;
    }
  }

  return { deletedCount, blockedCount, hasMore: false };
}
