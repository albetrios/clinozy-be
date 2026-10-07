import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { SavedViewOutput } from './saved-views.types.js';

/** Shapes a `app.saved_views` row as the API returns it (public ids, numbers, ISO times). */
export function serializeSavedView(
  row: BaseRecordRow,
  _references: BaseRecordReferenceLookup,
): SavedViewOutput {
  return {
    id: row.public_id,
    list_key: row.list_key as string,
    label: row.label as string,
    filters: row.filters as unknown,
    hidden_columns: row.hidden_columns as string[],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
