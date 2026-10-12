import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { calendarDateInTimeZone, toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { offerStatusOn } from './offers.rules.js';
import type { OfferOutput } from './offers.types.js';

/** The time zone of the serializer's first `status` — the rules' decorate re-derives it on the organization's today. */
const SERIALIZER_TIME_ZONE = 'UTC';

/** Shapes an `app.offers` row as the API returns it (public ids, numbers, the derived status). */
export function serializeOffer({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): OfferOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    code: row.code as string | null,
    kind: row.kind as string,
    value: toAmount(row.value) as number,
    offering_ids: references.listOf({ field: 'offering_ids', row }),
    branch_ids: references.listOf({ field: 'branch_ids', row }),
    starts_on: row.starts_on as string | null,
    ends_on: row.ends_on as string | null,
    is_active: row.is_active as boolean,
    status: offerStatusOn({
      offer: { is_active: row.is_active, starts_on: row.starts_on, ends_on: row.ends_on },
      today: calendarDateInTimeZone({ timeZone: SERIALIZER_TIME_ZONE }),
    }),
    tone: row.tone as string,
    note: row.note as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
