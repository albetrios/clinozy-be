import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patients } from './patients.schema.js';
import type { PatientsRepository } from './patients.repository.js';
import { serializePatient } from './patients.serializer.js';
import type { PatientOutput } from './patients.types.js';
import { patientsRules } from './patients.rules.js';
import {
  validateCreatePatient,
  validateListPatientsQuery,
  validateUpdatePatient,
} from './patients.validator.js';

/**
 * Patients of the active organization (launch ROUTE #13): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Patient')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class PatientsService extends BaseRecordService<PatientOutput> {
  constructor(organizationService: OrganizationService, repository: PatientsRepository) {
    super(organizationService, {
      label: 'Patient',
      repository,
      parseCreate: validateCreatePatient,
      parseUpdate: validateUpdatePatient,
      parseList: validateListPatientsQuery,
      serialize: serializePatient,
      references: [
        { field: 'home_branch_id', table: branches, label: 'branch' },
        { field: 'referred_by_patient_id', table: patients, label: 'patient' },
        { field: 'doctor_membership_id', table: memberships, label: 'team member' },
        { field: 'lead_id', table: leads, label: 'lead' },
      ],
      ...patientsRules,
    });
  }
}
