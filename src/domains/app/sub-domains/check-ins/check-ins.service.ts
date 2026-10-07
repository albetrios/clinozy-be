import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { treatments } from '@/domains/app/sub-domains/treatments/treatments.schema.js';
import { CHECK_IN_NEXT_OFFERINGS_LINK, type CheckInsRepository } from './check-ins.repository.js';
import { serializeCheckIn } from './check-ins.serializer.js';
import type { CheckInOutput } from './check-ins.types.js';
import { checkInsRules } from './check-ins.rules.js';
import {
  validateCreateCheckIn,
  validateListCheckInsQuery,
  validateUpdateCheckIn,
} from './check-ins.validator.js';

/**
 * Check-ins of the active organization (launch ROUTE #41): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Check-in')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class CheckInsService extends BaseRecordService<CheckInOutput> {
  constructor(organizationService: OrganizationService, repository: CheckInsRepository) {
    super(organizationService, {
      label: 'Check-in',
      repository,
      parseCreate: validateCreateCheckIn,
      parseUpdate: validateUpdateCheckIn,
      parseList: validateListCheckInsQuery,
      serialize: serializeCheckIn,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        { field: 'treatment_id', table: treatments, label: 'treatment' },
      ],
      referenceLists: [
        { field: 'next_offering_ids', link: CHECK_IN_NEXT_OFFERINGS_LINK, label: 'offering' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      ...checkInsRules,
    });
  }
}
