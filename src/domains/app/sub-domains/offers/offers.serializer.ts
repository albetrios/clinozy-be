import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { OfferOutput } from './offers.types.js';

/** Shapes a `app.offers` row as the API returns it (public ids, numbers, ISO times). */
export function serializeOffer(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): OfferOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    code: row.code as string | null,
    kind: row.kind as string,
    value: toAmount(row.value) as number,
    offering_ids: references.listOf('offering_ids', row),
    branch_ids: references.listOf('branch_ids', row),
    starts_on: row.starts_on as string | null,
    ends_on: row.ends_on as string | null,
    is_paused: row.is_paused as boolean,
    tone: row.tone as string,
    note: row.note as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
