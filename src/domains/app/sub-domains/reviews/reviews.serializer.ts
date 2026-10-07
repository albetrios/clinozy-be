import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { ReviewOutput } from './reviews.types.js';

/** Shapes a `app.reviews` row as the API returns it (public ids, numbers, ISO times). */
export function serializeReview(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): ReviewOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf('patient_id', row) ?? '',
    appointment_id: references.publicIdOf('appointment_id', row),
    source: row.source as string,
    rating: row.rating as number | null,
    text: row.text as string | null,
    link: row.link as string | null,
    file_keys: row.file_keys as string[],
    review_date: row.review_date as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
