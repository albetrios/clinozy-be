import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount, toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { DayCloseOutput } from './day-closes.types.js';

/** Shapes a `app.day_closes` row as the API returns it (public ids, numbers, ISO times). */
export function serializeDayClose(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): DayCloseOutput {
  return {
    id: row.public_id,
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    close_date: row.close_date as string,
    status: row.status as string,
    opening_cash: toAmount(row.opening_cash) as number,
    opening_source: row.opening_source as string,
    opening_accepted_at: toInstant(row.opening_accepted_at) as string,
    counted_cash: toAmount(row.counted_cash),
    closed_at: toInstant(row.closed_at),
    difference_reason: row.difference_reason as string | null,
    reopened_at: toInstant(row.reopened_at),
    is_auto_closed: row.is_auto_closed as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
