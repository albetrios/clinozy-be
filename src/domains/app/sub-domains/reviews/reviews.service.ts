import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { ReviewsRepository } from './reviews.repository.js';
import { serializeReview } from './reviews.serializer.js';
import type { ReviewOutput } from './reviews.types.js';
import {
  validateCreateReview,
  validateListReviewsQuery,
  validateUpdateReview,
} from './reviews.validator.js';

/**
 * Reviews of the active organization (launch ROUTE #42): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Review')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class ReviewsService extends BaseRecordService<ReviewOutput> {
  constructor(organizationService: OrganizationService, repository: ReviewsRepository) {
    super(organizationService, {
      label: 'Review',
      repository,
      parseCreate: validateCreateReview,
      parseUpdate: validateUpdateReview,
      parseList: validateListReviewsQuery,
      serialize: serializeReview,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
    });
  }
}
