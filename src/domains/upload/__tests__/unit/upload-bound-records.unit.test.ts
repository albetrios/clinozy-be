import { describe, expect, it } from 'vitest';
import { UPLOAD_RECORD_RESOURCE } from '@/domains/app/base-record.types.js';
import { UPLOAD_BOUND_RECORD_TABLES } from '@/domains/upload/upload-bound-records.js';

/**
 * C-2 / G2-5: every record kind an upload can be bound to has its table in the orphan sweep's
 * registry — a kind missing here would keep the files of its purged records forever.
 */
describe('UPLOAD_BOUND_RECORD_TABLES', () => {
  it('names a table for every bindable record kind, and no other', () => {
    expect(Object.keys(UPLOAD_BOUND_RECORD_TABLES).sort()).toEqual(
      Object.values(UPLOAD_RECORD_RESOURCE).sort(),
    );
  });
});
