import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { SupplierOutput } from './suppliers.types.js';

/** Shapes a `app.suppliers` row as the API returns it (public ids, numbers, ISO times). */
export function serializeSupplier(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): SupplierOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    phone: row.phone as string | null,
    gst_number: row.gst_number as string | null,
    manufacturer_ids: references.listOf('manufacturer_ids', row),
    is_quick: row.is_quick as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
