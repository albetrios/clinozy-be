import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { VisitsRepository } from './visits.repository.js';
import { serializeVisit } from './visits.serializer.js';
import type { VisitOutput } from './visits.types.js';
import {
  validateCreateVisit,
  validateListVisitsQuery,
  validateStageVisit,
  validateUpdateVisit,
} from './visits.validator.js';

/**
 * Visits of the active organization (launch ROUTE #22): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `stage`, `pause`, `resume`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Visit')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class VisitsService extends BaseRecordService<VisitOutput> {
  constructor(organizationService: OrganizationService, repository: VisitsRepository) {
    super(organizationService, {
      label: 'Visit',
      repository,
      parseCreate: validateCreateVisit,
      parseUpdate: validateUpdateVisit,
      parseList: validateListVisitsQuery,
      serialize: serializeVisit,
      references: [
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        { field: 'patient_id', table: patients, label: 'patient' },
      ],
      conflicts: {
        idx_visits_appointment_unique: 'errors:recordAlreadyExists',
      },
      transitions: {
        stage: {
          statusColumn: 'stage',
          from: ['waiting', 'with_doctor', 'treatment', 'checkout', 'pharmacy'],
          stamp: ['stage_changed_at'],
          parse: validateStageVisit,
        },
        pause: {
          statusColumn: 'stage',
          from: ['waiting', 'with_doctor', 'treatment', 'checkout', 'pharmacy'],
          stamp: ['paused_at'],
        },
        resume: {
          statusColumn: 'stage',
          from: ['waiting', 'with_doctor', 'treatment', 'checkout', 'pharmacy'],
          set: { paused_at: null },
        },
      },
    });
  }
}
