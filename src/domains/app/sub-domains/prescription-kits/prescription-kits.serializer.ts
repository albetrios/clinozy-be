import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { PrescriptionKitOutput } from './prescription-kits.types.js';

/** Shapes a `app.prescription_kits` row as the API returns it (public ids, numbers, ISO times). */
export function serializePrescriptionKit(
  row: BaseRecordRow,
  _references: BaseRecordReferenceLookup,
): PrescriptionKitOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    items: row.items as unknown,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
