import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { PatientReportsRepository } from './patient-reports.repository.js';
import { serializePatientReport } from './patient-reports.serializer.js';
import type { PatientReportOutput } from './patient-reports.types.js';
import {
  validateCreatePatientReport,
  validateListPatientReportsQuery,
  validateUpdatePatientReport,
} from './patient-reports.validator.js';

/**
 * Patient reports of the active organization (launch ROUTE #28): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Patient report')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class PatientReportsService extends BaseRecordService<PatientReportOutput> {
  constructor(organizationService: OrganizationService, repository: PatientReportsRepository) {
    super(organizationService, {
      label: 'Patient report',
      repository,
      parseCreate: validateCreatePatientReport,
      parseUpdate: validateUpdatePatientReport,
      parseList: validateListPatientReportsQuery,
      serialize: serializePatientReport,
      references: [{ field: 'patient_id', table: patients, label: 'patient' }],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
    });
  }
}
