import { describe, expect, it, vi } from 'vitest';
import { purgeRowsAfterTheirObjects } from '@/infrastructure/storage/stored-object-purge.util.js';
import type { ObjectDeleteResult } from '@/infrastructure/storage/object-storage.port.js';
import { createObjectStoragePortMock } from '@/tests/helpers/object-storage-mock.helper.js';

type Row = { id: number; objectKey: string };

function rows(ids: number[]): Row[] {
  return ids.map((id) => ({ id, objectKey: `objects/${id}` }));
}

/** A keyset reader over `table`: rows with an id past `afterId`, ascending, `limit` at most. */
function keysetReader(table: Row[]) {
  return vi.fn(async ({ afterId, limit }: { afterId: number; limit: number }) =>
    table.filter((row) => row.id > afterId).slice(0, limit),
  );
}

function deleteResults(results: Record<string, ObjectDeleteResult>) {
  return vi.fn(async (key: string) => results[key] ?? { kind: 'deleted' as const });
}

describe('purgeRowsAfterTheirObjects', () => {
  it('deletes every row whose object is gone, page by page', async () => {
    const objectStorage = createObjectStoragePortMock();
    const readBatch = keysetReader(rows([1, 2, 3, 4, 5]));
    const deleteRows = vi.fn(async () => undefined);

    const result = await purgeRowsAfterTheirObjects({
      objectStorage,
      batchSize: 2,
      readBatch,
      deleteRows,
      onObjectKept: vi.fn(),
    });

    expect(result).toEqual({ deletedCount: 5, keptCount: 0, stoppedOnOpenCircuit: false });
    expect(deleteRows.mock.calls).toEqual([[[1, 2]], [[3, 4]], [[5]]]);
    expect(readBatch).toHaveBeenNthCalledWith(2, { afterId: 2, limit: 2 });
  });

  it('keeps a row whose object delete failed — and still walks past it', async () => {
    const objectStorage = createObjectStoragePortMock({
      deleteObject: deleteResults({ 'objects/2': { kind: 'failed', circuitOpen: false } }),
    });
    const onObjectKept = vi.fn();
    const deleteRows = vi.fn(async () => undefined);

    const result = await purgeRowsAfterTheirObjects({
      objectStorage,
      batchSize: 2,
      readBatch: keysetReader(rows([1, 2, 3])),
      deleteRows,
      onObjectKept,
    });

    expect(result).toEqual({ deletedCount: 2, keptCount: 1, stoppedOnOpenCircuit: false });
    expect(deleteRows.mock.calls).toEqual([[[1]], [[3]]]);
    expect(onObjectKept).toHaveBeenCalledWith({ id: 2, objectKey: 'objects/2' });
  });

  it('stops at once on an open circuit, after deleting the rows already cleared', async () => {
    const objectStorage = createObjectStoragePortMock({
      deleteObject: deleteResults({ 'objects/2': { kind: 'failed', circuitOpen: true } }),
    });
    const deleteRows = vi.fn(async () => undefined);
    const readBatch = keysetReader(rows([1, 2, 3, 4]));

    const result = await purgeRowsAfterTheirObjects({
      objectStorage,
      batchSize: 10,
      readBatch,
      deleteRows,
      onObjectKept: vi.fn(),
    });

    expect(result).toEqual({ deletedCount: 1, keptCount: 1, stoppedOnOpenCircuit: true });
    expect(deleteRows.mock.calls).toEqual([[[1]]]);
    expect(objectStorage.deleteObject).not.toHaveBeenCalledWith('objects/3');
    expect(readBatch).toHaveBeenCalledOnce();
  });

  it('never deletes a row before its object: no row delete for a page whose objects all failed', async () => {
    const objectStorage = createObjectStoragePortMock({
      deleteObject: vi.fn(async () => ({ kind: 'failed' as const, circuitOpen: false })),
    });
    const deleteRows = vi.fn(async () => undefined);

    const result = await purgeRowsAfterTheirObjects({
      objectStorage,
      batchSize: 2,
      readBatch: keysetReader(rows([1, 2])),
      deleteRows,
      onObjectKept: vi.fn(),
    });

    expect(result).toEqual({ deletedCount: 0, keptCount: 2, stoppedOnOpenCircuit: false });
    expect(deleteRows).not.toHaveBeenCalled();
  });

  it('does nothing on an empty table', async () => {
    const objectStorage = createObjectStoragePortMock();
    const deleteRows = vi.fn(async () => undefined);

    const result = await purgeRowsAfterTheirObjects({
      objectStorage,
      batchSize: 500,
      readBatch: keysetReader([]),
      deleteRows,
      onObjectKept: vi.fn(),
    });

    expect(result).toEqual({ deletedCount: 0, keptCount: 0, stoppedOnOpenCircuit: false });
    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
    expect(deleteRows).not.toHaveBeenCalled();
  });
});
