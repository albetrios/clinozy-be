import type { ObjectStoragePort } from '@/infrastructure/storage/object-storage.port.js';

/** A row whose storage object must be gone before the row itself may go. */
export interface RowWithStoredObject {
  id: number;
  objectKey: string;
}

/** Outcome of one {@link purgeRowsAfterTheirObjects} run. */
export interface StoredObjectPurgeResult {
  /** Rows hard-deleted — each one's object was deleted (or already absent) first. */
  deletedCount: number;
  /** Rows kept because their object delete failed; the next run retries them. */
  keptCount: number;
  /** True when the run stopped early because the storage circuit is open. */
  stoppedOnOpenCircuit: boolean;
}

/**
 * Hard-deletes rows only after their storage objects are gone, in batches whose database work
 * never spans the storage calls.
 *
 * @remarks
 * - **Algorithm:** keyset over `id`: read a batch (`readBatch`, in the caller's own short
 *   database context), delete each row's object outside any context, then delete — in a second
 *   short context (`deleteRows`) — only the rows whose object delete succeeded. Continues after
 *   the last id read, so rows kept on a failed delete never stall the walk.
 * - **Failure modes:** a failed object delete keeps its row for the next run. An open storage
 *   circuit stops the run at once: every remaining call would fail instantly, and walking the
 *   rest of the table would only log noise. Database errors propagate; batches already deleted
 *   stay deleted, since each commits on its own.
 * - **Side effects:** object deletes; row deletes through `deleteRows`.
 * - **Notes:** deleting a row before its object leaves an object nothing references — for
 *   retention of user content and personal-data exports that is data kept past its deletion
 *   date, with no row left to find it by. One context per job, as these jobs used to run, also
 *   held a pooled connection and an open transaction across every storage call.
 */
export async function purgeRowsAfterTheirObjects<TRow extends RowWithStoredObject>(options: {
  objectStorage: ObjectStoragePort;
  batchSize: number;
  readBatch: (page: { afterId: number; limit: number }) => Promise<TRow[]>;
  deleteRows: (ids: number[]) => Promise<void>;
  onObjectKept: (row: TRow) => void;
}): Promise<StoredObjectPurgeResult> {
  const { batchSize, readBatch, deleteRows } = options;
  let afterId = 0;
  let deletedCount = 0;
  let keptCount = 0;

  for (;;) {
    const batch = await readBatch({ afterId, limit: batchSize });
    if (batch.length === 0) break;

    const page = await deleteObjectsOfPage({
      batch,
      objectStorage: options.objectStorage,
      onObjectKept: options.onObjectKept,
    });
    keptCount += page.keptCount;
    if (page.purgeableIds.length > 0) {
      await deleteRows(page.purgeableIds);
      deletedCount += page.purgeableIds.length;
    }
    if (page.circuitOpen) {
      return { deletedCount, keptCount, stoppedOnOpenCircuit: true };
    }

    afterId = batch.at(-1)!.id;
    if (batch.length < batchSize) break;
  }

  return { deletedCount, keptCount, stoppedOnOpenCircuit: false };
}

/** Deletes one page's objects in order, stopping at the first open-circuit refusal. */
async function deleteObjectsOfPage<TRow extends RowWithStoredObject>(options: {
  batch: readonly TRow[];
  objectStorage: ObjectStoragePort;
  onObjectKept: (row: TRow) => void;
}): Promise<{ purgeableIds: number[]; keptCount: number; circuitOpen: boolean }> {
  const purgeableIds: number[] = [];
  let keptCount = 0;
  for (const row of options.batch) {
    const result = await options.objectStorage.deleteObject(row.objectKey);
    if (result.kind === 'deleted') {
      purgeableIds.push(row.id);
      continue;
    }
    keptCount += 1;
    options.onObjectKept(row);
    if (result.circuitOpen) {
      return { purgeableIds, keptCount, circuitOpen: true };
    }
  }
  return { purgeableIds, keptCount, circuitOpen: false };
}
