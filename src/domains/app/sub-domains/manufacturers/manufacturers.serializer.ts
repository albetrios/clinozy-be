import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { ManufacturerOutput } from './manufacturers.types.js';

/** Shapes a `app.manufacturers` row as the API returns it (public ids, numbers, ISO times). */
export function serializeManufacturer(
  row: BaseRecordRow,
  _references: BaseRecordReferenceLookup,
): ManufacturerOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    tone: row.tone as string,
    is_quick: row.is_quick as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
