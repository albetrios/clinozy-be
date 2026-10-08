import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { ManufacturerOutput } from './manufacturers.types.js';

/**
 * Shapes an `app.manufacturers` row as the API returns it (routes-final 11.A.6). The medicine
 * count and the linked suppliers and MRs are the rules' `decorate`.
 */
export function serializeManufacturer(row: BaseRecordRow): ManufacturerOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    tone: row.tone as string,
    is_quick: row.is_quick as boolean,
    medicine_count: 0,
    suppliers: [],
    medical_reps: [],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
