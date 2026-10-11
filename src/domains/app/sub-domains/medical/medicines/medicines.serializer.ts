import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { MEDICINE_STOCK_LEVEL } from './medicines.constants.js';
import type { MedicineOutput } from './medicines.types.js';

/** MD12: out at 0, low at or under the reorder level, else ok. */
export function medicineStockLevel({
  quantity,
  min_stock: minStock,
}: {
  quantity: number;
  min_stock: number;
}): string {
  if (quantity === 0) return MEDICINE_STOCK_LEVEL.OUT;
  return quantity <= minStock ? MEDICINE_STOCK_LEVEL.LOW : MEDICINE_STOCK_LEVEL.OK;
}

/** Two decimals. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Shapes an `app.medicines` row as the API returns it (routes-final 11.D.6). The manufacturer's
 * name and tone, the batches, prices, nearest expiry, best rate and margin are the rules'
 * `decorate`.
 */
export function serializeMedicine({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): MedicineOutput {
  const mrp = toAmount(row.mrp) ?? 0;
  const gstPercent = Number(row.gst_percent);
  const quantity = Number(row.quantity);
  const composition = (row.composition as string | null) ?? null;
  const manufacturerId = references.publicIdOf({ field: 'manufacturer_id', row });
  return {
    id: row.public_id,
    medicine_number: row.medicine_number as number,
    name: row.name as string,
    composition,
    manufacturer: manufacturerId === null ? null : { id: manufacturerId, name: '', tone: '' },
    is_prescription_only: row.is_prescription_only as boolean,
    mrp,
    gst_percent: gstPercent,
    price_before_gst: round2(mrp / (1 + gstPercent / 100)),
    min_stock: Number(row.min_stock),
    max_stock: Number(row.max_stock),
    quantity,
    stock_level: medicineStockLevel({ quantity, min_stock: Number(row.min_stock) }),
    nearest_expiry: null,
    near_expiry_discount_percent: toAmount(row.near_expiry_discount_percent),
    best_rate: null,
    margin_percent: null,
    is_quick: row.is_quick as boolean,
    needs_details: row.is_quick === true && (mrp === 0 || composition === null),
    batches: [],
    supplier_prices: [],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
