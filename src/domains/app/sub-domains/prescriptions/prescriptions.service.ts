import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { PrescriptionsRepository } from './prescriptions.repository.js';
import { serializePrescription } from './prescriptions.serializer.js';
import type { PrescriptionOutput } from './prescriptions.types.js';
import {
  validateCreatePrescription,
  validateListPrescriptionsQuery,
  validateUpdatePrescription,
} from './prescriptions.validator.js';

/**
 * Prescriptions of the active organization (launch ROUTE #25): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `approve`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Prescription')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class PrescriptionsService extends BaseRecordService<PrescriptionOutput> {
  constructor(organizationService: OrganizationService, repository: PrescriptionsRepository) {
    super(organizationService, {
      label: 'Prescription',
      repository,
      parseCreate: validateCreatePrescription,
      parseUpdate: validateUpdatePrescription,
      parseList: validateListPrescriptionsQuery,
      serialize: serializePrescription,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        { field: 'doctor_membership_id', table: memberships, label: 'team member' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      transitions: {
        approve: { from: ['draft'], set: { status: 'approved' }, stamp: ['approved_at'] },
      },
    });
  }
}
