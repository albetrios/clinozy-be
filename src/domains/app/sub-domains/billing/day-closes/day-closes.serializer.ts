import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount, toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { DayCloseOutput } from './day-closes.types.js';

/**
 * Shapes an `app.day_closes` row as the API returns it (routes-final 8.E.6). The live figures, the
 * members and the events are the rules' `decorate`.
 */
export function serializeDayClose(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): DayCloseOutput {
  return {
    id: row.public_id,
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    close_date: row.close_date as string,
    status: row.status as string,
    opening_cash: toAmount(row.opening_cash) ?? 0,
    opening_source: row.opening_source as string,
    opening_accepted_at: toInstant(row.opening_accepted_at) as string,
    opening_accepted_by_membership_id: references.publicIdOf(
      'opening_accepted_by_membership_id',
      row,
    ),
    cash_in: 0,
    cash_out: 0,
    expected_cash: toAmount(row.expected_cash),
    counted_cash: toAmount(row.counted_cash),
    difference: toAmount(row.difference),
    difference_reason: (row.difference_reason as string | null) ?? null,
    close_kind: (row.close_kind as string | null) ?? null,
    closed_at: toInstant(row.closed_at),
    closed_by_membership_id: references.publicIdOf('closed_by_membership_id', row),
    net_by_mode: { cash: 0, upi: 0, card: 0, credit: 0 },
    by_member: [],
    entry_count: 0,
    events: [],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
