import { sql } from 'drizzle-orm';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { patient_feedback_actions } from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.schema.js';
import { PATIENT_REVIEW_ACTION_RATING_MAX } from './patient-reviews.constants.js';
import { patient_reviews } from './patient-reviews.schema.js';

/** A review needs a call (TR11): a rating ≤ 3. */
const isFlagged = sql`(${patient_reviews.rating} is not null and ${patient_reviews.rating} <= ${PATIENT_REVIEW_ACTION_RATING_MAX})`;

/** A review has a feedback action (TR12). */
const hasAction = sql`exists (select 1 from ${patient_feedback_actions} where ${patient_feedback_actions.patient_review_id} = ${patient_reviews.id})`;

/**
 * Persistence for `app.patient_reviews` (launch ROUTE #134, routes-final 7.J) — the shared app
 * record reads and writes on its table.
 *
 * @remarks
 * - **Algorithm:** sorts `review_date` (newest first) and `created_at`; the derived `needs_action`
 *   filter — a rating ≤ 3 with no feedback action (TR11).
 */
export class PatientReviewsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_reviews,
      entity: 'patientReview',
      searchColumns: [],
      sortColumns: { created_at: 'created_at', review_date: 'text' },
      derivedFilters: {
        needs_action: (value) =>
          value === true
            ? sql`(${isFlagged} and not ${hasAction})`
            : sql`not (${isFlagged} and not ${hasAction})`,
      },
      defaultSort: 'review_date',
      defaultOrder: 'desc',
    });
  }
}
