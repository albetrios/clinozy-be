import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { invoices } from '@/domains/app/sub-domains/invoices/invoices.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { PatientPackagesRepository } from './patient-packages.repository.js';
import { serializePatientPackage } from './patient-packages.serializer.js';
import type { PatientPackageOutput } from './patient-packages.types.js';
import {
  validateCreatePatientPackage,
  validateListPatientPackagesQuery,
  validateUpdatePatientPackage,
} from './patient-packages.validator.js';

/**
 * Patient packages of the active organization (launch ROUTE #31): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Patient package')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class PatientPackagesService extends BaseRecordService<PatientPackageOutput> {
  constructor(organizationService: OrganizationService, repository: PatientPackagesRepository) {
    super(organizationService, {
      label: 'Patient package',
      repository,
      parseCreate: validateCreatePatientPackage,
      parseUpdate: validateUpdatePatientPackage,
      parseList: validateListPatientPackagesQuery,
      serialize: serializePatientPackage,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'offering_id', table: offerings, label: 'offering' },
        { field: 'invoice_id', table: invoices, label: 'invoice' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
    });
  }
}
