import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { OfferingOutput } from './offerings.types.js';

/** Shapes an `app.offerings` row as the API returns it (public ids, rupees as numbers, ISO times). */
export function serializeOffering(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): OfferingOutput {
  return {
    id: row.public_id,
    offering_number: row.offering_number as number,
    name: row.name as string,
    category: row.category as string,
    specialty: row.specialty as string,
    tone: row.tone as string,
    price: toAmount(row.price) as number,
    min_price: toAmount(row.min_price) as number,
    duration_minutes: row.duration_minutes as number,
    sessions: row.sessions as number,
    validity_days: row.validity_days as number,
    gst_percent: row.gst_percent as number,
    is_active: row.is_active as boolean,
    offering_group_id: references.publicIdOf('offering_group_id', row),
    offer_price: toAmount(row.offer_price),
    branch_ids: references.listOf('branch_ids', row),
    is_gst_inclusive: row.is_gst_inclusive as boolean,
    search_terms: row.search_terms as string[],
    description: row.description as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
