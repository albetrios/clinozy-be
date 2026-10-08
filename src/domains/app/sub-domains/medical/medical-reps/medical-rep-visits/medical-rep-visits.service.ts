import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { medical_reps } from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.schema.js';
import type { MedicalRepVisitsRepository } from './medical-rep-visits.repository.js';
import { medicalRepVisitsRules } from './medical-rep-visits.rules.js';
import { serializeMedicalRepVisit } from './medical-rep-visits.serializer.js';
import type { MedicalRepVisitOutput } from './medical-rep-visits.types.js';
import {
  refuseMedicalRepVisitUpdate,
  validateCreateMedicalRepVisit,
  validateListMedicalRepVisitsQuery,
} from './medical-rep-visits.validator.js';

/**
 * An MR's logged visits (launch ROUTE #153, routes-final 11.G), nested under the MR: list, log,
 * read, delete, restore — never changed (MD18).
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.medical_rep_visits` under its MR
 *   (a removed or unknown MR is a 404); the rules set the MR's next visit. Reading needs
 *   `medicine:read`, logging `medicine:create`, deleting and restoring `medicine:delete` (the
 *   routes' gates, MD2).
 * - **Failure modes:** `NotFoundError('Medical rep' | 'Medical rep visit')`; `ValidationError` for
 *   a bad body or dates; `ConflictError` for a restore of a live visit.
 */
export class MedicalRepVisitsService extends BaseRecordService<MedicalRepVisitOutput> {
  constructor(organizationService: OrganizationService, repository: MedicalRepVisitsRepository) {
    super(organizationService, {
      label: 'Medical rep visit',
      repository,
      parseCreate: validateCreateMedicalRepVisit,
      parseUpdate: refuseMedicalRepVisitUpdate,
      parseList: validateListMedicalRepVisitsQuery,
      serialize: serializeMedicalRepVisit,
      references: [
        { field: 'medical_rep_id', table: medical_reps, label: 'medical rep' },
        { field: 'logged_by_membership_id', table: memberships, label: 'team member' },
      ],
      parent: { field: 'medical_rep_id', table: medical_reps, label: 'Medical rep' },
      ...medicalRepVisitsRules,
    });
  }
}
