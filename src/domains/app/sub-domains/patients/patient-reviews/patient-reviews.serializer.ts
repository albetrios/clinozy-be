import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { PatientReviewOutput } from './patient-reviews.types.js';

/**
 * Shapes an `app.patient_reviews` row as the API returns it (routes-final 7.J.6). The actions and
 * `needs_action` are the rules' `decorate` (one read per page) — empty here.
 */
export function serializePatientReview({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): PatientReviewOutput {
  return {
    id: row.public_id,
    patient_id: references.publicIdOf({ field: 'patient_id', row }) ?? '',
    appointment_id: references.publicIdOf({ field: 'appointment_id', row }),
    source: row.source as string,
    rating: row.rating as number | null,
    text: row.text as string | null,
    link: row.link as string | null,
    file_keys: row.file_keys as string[],
    review_date: row.review_date as string,
    needs_action: false,
    actions: [],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
