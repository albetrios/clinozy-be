import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { FeedbackActionOutput } from './feedback-actions.types.js';

/** Shapes a `app.feedback_actions` row as the API returns it (public ids, numbers, ISO times). */
export function serializeFeedbackAction(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): FeedbackActionOutput {
  return {
    id: row.public_id,
    check_in_id: references.publicIdOf('check_in_id', row),
    review_id: references.publicIdOf('review_id', row),
    action: row.action as string,
    note: row.note as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
