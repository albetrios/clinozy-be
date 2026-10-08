import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { BranchHolidayOutput } from './branch-holidays.types.js';

/** Shapes a `app.branch_holidays` row as the API returns it (public ids, numbers, ISO times). */
export function serializeBranchHoliday(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): BranchHolidayOutput {
  return {
    id: row.public_id,
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    holiday_date: row.holiday_date as string,
    label: row.label as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
