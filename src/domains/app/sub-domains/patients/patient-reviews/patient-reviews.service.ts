import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { PatientReviewsRepository } from './patient-reviews.repository.js';
import { patientReviewsRules } from './patient-reviews.rules.js';
import { serializePatientReview } from './patient-reviews.serializer.js';
import type { PatientReviewOutput } from './patient-reviews.types.js';
import {
  validateCreatePatientReview,
  validateListPatientReviewsQuery,
  validateUpdatePatientReview,
} from './patient-reviews.validator.js';

/**
 * A patient's reviews (launch ROUTE #134, routes-final 7.J): what the patient said on Google,
 * video, Instagram, the clinic's form or WhatsApp — list, read, log, change, delete with a reason,
 * restore, and log what was done about one (7.K).
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} nested under the patient (`patient_id` — a
 *   removed or unknown patient is a 404); the visit is a reference. No organization-wide list
 *   (TR11). Reading needs `patient:read`; logging `patient_review:create`, changing and logging an action
 *   `patient_review:update`, deleting and restoring `patient_review:delete` (the routes' gates — their
 *   own codes so Marketing logs reviews, launch D83 (4)).
 * - **Failure modes:** `NotFoundError('Patient review')` / `('Patient')`; `ValidationError` for a
 *   bad body or query, a reference that is no live record here, another contact's visit, a file
 *   that is no confirmed upload, a non-`https://` link or a future `review_date`; `ConflictError`
 *   for a stale save or a restore of a live review.
 */
export class PatientReviewsService extends BaseRecordService<PatientReviewOutput> {
  constructor(organizationService: OrganizationService, repository: PatientReviewsRepository) {
    super(organizationService, {
      label: 'Patient review',
      repository,
      parseCreate: validateCreatePatientReview,
      parseUpdate: validateUpdatePatientReview,
      parseList: validateListPatientReviewsQuery,
      serialize: serializePatientReview,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      ...patientReviewsRules,
    });
  }
}
