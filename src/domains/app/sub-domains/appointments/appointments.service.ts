import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { ValidationError } from '@/shared/errors/index.js';
import { appointments } from './appointments.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { branch_machines } from '@/domains/app/sub-domains/branches/branch-machines/branch-machines.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patient_packages } from '@/domains/app/sub-domains/patient-packages/patient-packages.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { branch_rooms } from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.schema.js';
import type { AppointmentsRepository } from './appointments.repository.js';
import { serializeAppointment } from './appointments.serializer.js';
import type { AppointmentOutput } from './appointments.types.js';
import { appointmentsRules } from './appointments.rules.js';
import {
  validateCancelAppointment,
  validateCreateAppointment,
  validateListAppointmentsQuery,
  validateStatusAppointment,
  validateUpdateAppointment,
} from './appointments.validator.js';

/**
 * Appointments of the active organization (launch ROUTE #21): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `status`, `cancel`, `reinstate`, `undo-check-in`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Appointment')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class AppointmentsService extends BaseRecordService<AppointmentOutput> {
  constructor(organizationService: OrganizationService, repository: AppointmentsRepository) {
    super(organizationService, {
      label: 'Appointment',
      repository,
      parseCreate: validateCreateAppointment,
      parseUpdate: validateUpdateAppointment,
      parseList: validateListAppointmentsQuery,
      serialize: serializeAppointment,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'lead_id', table: leads, label: 'lead' },
        { field: 'branch_id', table: branches, label: 'branch' },
        { field: 'offering_id', table: offerings, label: 'offering' },
        { field: 'doctor_membership_id', table: memberships, label: 'team member' },
        { field: 'therapist_membership_id', table: memberships, label: 'team member' },
        { field: 'branch_room_id', table: branch_rooms, label: 'room' },
        { field: 'branch_machine_id', table: branch_machines, label: 'machine' },
        { field: 'copied_from_appointment_id', table: appointments, label: 'appointment' },
        { field: 'patient_package_id', table: patient_packages, label: 'patient package' },
      ],
      branchColumn: 'branch_id',
      checkValues: (values) => {
        if (
          (values.patient_id === undefined || values.patient_id === null) ===
          (values.lead_id === undefined || values.lead_id === null)
        ) {
          throw new ValidationError(
            'errors:validation.recordFieldRule',
            { field: 'patient_id' },
            {
              patient_id: ['Name exactly one of patient_id or lead_id'],
            },
          );
        }
      },
      transitions: {
        status: {
          from: ['scheduled', 'confirmed', 'checked_in'],
          parse: validateStatusAppointment,
        },
        cancel: {
          from: ['scheduled', 'confirmed'],
          set: { status: 'cancelled' },
          parse: validateCancelAppointment,
        },
        reinstate: {
          from: ['cancelled'],
          set: { status: 'scheduled', cancel_reason: null, cancel_note: null },
        },
        'undo-check-in': {
          from: ['checked_in'],
          set: { status: 'confirmed', checked_in_at: null },
        },
      },
      ...appointmentsRules,
    });
  }
}
