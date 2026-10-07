import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { UserPreferenceOutput } from './user-preferences.types.js';

/** Shapes a `app.user_preferences` row as the API returns it (public ids, numbers, ISO times). */
export function serializeUserPreference(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): UserPreferenceOutput {
  return {
    id: row.public_id,
    pinned_sections: row.pinned_sections as string[],
    branch_filter_ids: references.listOf('branch_filter_ids', row),
    theme: row.theme as string,
    patient_file_pins: row.patient_file_pins as string[],
    recent_picks: row.recent_picks as string[],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
