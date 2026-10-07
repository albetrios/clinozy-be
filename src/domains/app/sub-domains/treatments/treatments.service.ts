import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patient_packages } from '@/domains/app/sub-domains/patient-packages/patient-packages.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { TreatmentsRepository } from './treatments.repository.js';
import { serializeTreatment } from './treatments.serializer.js';
import type { TreatmentOutput } from './treatments.types.js';
import {
  validateCreateTreatment,
  validateListTreatmentsQuery,
  validateReverseTreatment,
  validateUpdateTreatment,
} from './treatments.validator.js';

/**
 * Treatments of the active organization (launch ROUTE #40): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `reverse`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Treatment')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class TreatmentsService extends BaseRecordService<TreatmentOutput> {
  constructor(organizationService: OrganizationService, repository: TreatmentsRepository) {
    super(organizationService, {
      label: 'Treatment',
      repository,
      parseCreate: validateCreateTreatment,
      parseUpdate: validateUpdateTreatment,
      parseList: validateListTreatmentsQuery,
      serialize: serializeTreatment,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        { field: 'offering_id', table: offerings, label: 'offering' },
        { field: 'doctor_membership_id', table: memberships, label: 'team member' },
        { field: 'therapist_membership_id', table: memberships, label: 'team member' },
        { field: 'patient_package_id', table: patient_packages, label: 'patient package' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      transitions: {
        reverse: {
          from: ['done'],
          set: { status: 'reversed' },
          stamp: ['reversed_at'],
          parse: validateReverseTreatment,
        },
      },
    });
  }
}
