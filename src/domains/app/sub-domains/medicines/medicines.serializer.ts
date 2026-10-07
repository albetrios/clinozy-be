import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { MedicineOutput } from './medicines.types.js';

/** Shapes a `app.medicines` row as the API returns it (public ids, numbers, ISO times). */
export function serializeMedicine(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): MedicineOutput {
  return {
    id: row.public_id,
    medicine_number: row.medicine_number as number,
    name: row.name as string,
    composition: row.composition as string | null,
    manufacturer_id: references.publicIdOf('manufacturer_id', row) ?? '',
    mrp: toAmount(row.mrp) as number,
    gst_percent: row.gst_percent as number,
    min_stock: row.min_stock as number,
    max_stock: row.max_stock as number,
    batches: row.batches as unknown,
    supplier_rates: row.supplier_rates as unknown,
    is_quick: row.is_quick as boolean,
    is_prescription_only: row.is_prescription_only as boolean,
    near_expiry_discount_percent: toAmount(row.near_expiry_discount_percent) as number,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
