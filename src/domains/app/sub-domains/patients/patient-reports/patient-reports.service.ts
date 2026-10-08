import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { PatientReportsRepository } from './patient-reports.repository.js';
import { patientReportsRules } from './patient-reports.rules.js';
import { serializePatientReport } from './patient-reports.serializer.js';
import type { PatientReportOutput } from './patient-reports.types.js';
import {
  validateCreatePatientReport,
  validateListPatientReportsQuery,
  validateUpdatePatientReport,
} from './patient-reports.validator.js';

/**
 * A patient's reports (launch ROUTE #133, routes-final 7.G): lab, scan, consent and other documents
 * — list, read, add, change, delete with a reason, restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} nested under the patient (`patient_id` — a
 *   removed or unknown patient is a 404). Clinical: reading needs `patient:clinical_record:read`,
 *   writing `patient:update` with it (P14, P29 — the routes' gates).
 * - **Failure modes:** `NotFoundError('Patient report')` / `('Patient')`; `ValidationError` for a
 *   bad body or a file that is no confirmed upload of the organization; `ConflictError` for a stale
 *   save or a restore of a live report.
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
      ...patientReportsRules,
    });
  }
}
