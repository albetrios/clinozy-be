import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { withAppDatabaseContext } from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { branch_machines } from '@/domains/app/sub-domains/branches/branch-machines/branch-machines.schema.js';
import { branch_rooms } from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  APPOINTMENT_MOVABLE_STATUS_VALUES,
  APPOINTMENT_SLOT_CONSTRAINTS,
  APPOINTMENT_BOOKING_MESSAGES_RESET,
  APPOINTMENT_STATUS,
  APPOINTMENT_VISIT_STAGE_VALUES,
} from './appointments.constants.js';
import { copyAppointmentDto } from './appointments.dto.js';
import type { AppointmentsRepository } from './appointments.repository.js';
import { createAppointmentsRules } from './appointments.rules.js';
import { appointments } from './appointments.schema.js';
import { serializeAppointment } from './appointments.serializer.js';
import type { AppointmentOutput } from './appointments.types.js';
import {
  validateCancelAppointment,
  validateCopiedAppointment,
  validateCreateAppointment,
  validateListAppointmentsQuery,
  validateStageAppointment,
  validateUpdateAppointment,
} from './appointments.validator.js';

/** What leaving the floor clears — the stage and its times (A10). */
const OFF_THE_FLOOR = { visit_stage: null, visit_stage_changed_at: null, visit_paused_at: null };

/** The `slot_taken` message of each resource the exclusion constraints guard (A3). */
const SLOT_TAKEN_KEYS: Readonly<Record<string, string>> = {
  doctor: 'errors:slotTakenDoctor',
  room: 'errors:slotTakenRoom',
  machine: 'errors:slotTakenMachine',
};

/** Each exclusion constraint → its `slot_taken` 409, naming the resource (A3). */
const SLOT_TAKEN_CONFLICTS = Object.fromEntries(
  Object.entries(APPOINTMENT_SLOT_CONSTRAINTS).map(([constraint, resource]) => [
    constraint,
    { key: SLOT_TAKEN_KEYS[resource] ?? 'errors:conflict', reason: 'slot_taken' },
  ]),
);

/**
 * Appointments of the active organization (launch ROUTE #132, routes-final 6) — the visit merged
 * in: book, walk in, list (and the floor), read, change or move, delete and restore, the lifecycle
 * (confirm, check in, complete, no-show, cancel, reinstate, undo check-in), copy, and the floor
 * stage, pause and resume; the calendar's slots and daily counts.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references,
 *   transitions, rules and serializer; every call runs in the caller's organization context. The
 *   exclusion constraints map to `409 slot_taken` naming the doctor, room or machine (A3). Copy
 *   reads the booking and books again through the create path — every check and conflict (A7).
 *   Branch-scoped on `branch_id` (D9).
 * - **Failure modes:** `NotFoundError('Appointment')`; `ValidationError` for a bad body or query
 *   or a reference that is no live record here; `ConflictError` for the slot rules, a clash, a
 *   status move not allowed, a stale save or a restore of a live booking.
 */
export class AppointmentsService extends BaseRecordService<AppointmentOutput> {
  constructor(organizationService: OrganizationService, repository: AppointmentsRepository) {
    super(organizationService, {
      label: 'Appointment',
      repository,
      parseCreate: validateCreateAppointment,
      namedCreates: { copy: validateCopiedAppointment },
      parseUpdate: validateUpdateAppointment,
      parseList: validateListAppointmentsQuery,
      serialize: serializeAppointment,
      references: [
        { field: 'contact_id', table: contacts, label: 'contact' },
        { field: 'branch_id', table: branches, label: 'branch' },
        { field: 'offering_id', table: offerings, label: 'offering' },
        { field: 'doctor_membership_id', table: memberships, label: 'team member' },
        { field: 'therapist_membership_id', table: memberships, label: 'team member' },
        { field: 'branch_room_id', table: branch_rooms, label: 'room' },
        { field: 'branch_machine_id', table: branch_machines, label: 'machine' },
        { field: 'copied_from_appointment_id', table: appointments, label: 'appointment' },
      ],
      branchColumn: 'branch_id',
      conflicts: SLOT_TAKEN_CONFLICTS,
      transitions: {
        confirm: {
          from: [APPOINTMENT_STATUS.SCHEDULED],
          set: { status: APPOINTMENT_STATUS.CONFIRMED },
        },
        'check-in': {
          from: APPOINTMENT_MOVABLE_STATUS_VALUES,
          set: {
            status: APPOINTMENT_STATUS.CHECKED_IN,
            visit_stage: APPOINTMENT_VISIT_STAGE_VALUES[0],
          },
          stamp: ['checked_in_at', 'visit_stage_changed_at'],
        },
        complete: {
          from: [APPOINTMENT_STATUS.CHECKED_IN],
          set: { status: APPOINTMENT_STATUS.COMPLETED, ...OFF_THE_FLOOR },
          stamp: ['completed_at'],
        },
        'no-show': {
          from: APPOINTMENT_MOVABLE_STATUS_VALUES,
          set: { status: APPOINTMENT_STATUS.NO_SHOW },
        },
        cancel: {
          from: APPOINTMENT_MOVABLE_STATUS_VALUES,
          set: { status: APPOINTMENT_STATUS.CANCELLED },
          parse: validateCancelAppointment,
        },
        reinstate: {
          from: [APPOINTMENT_STATUS.CANCELLED],
          set: {
            status: APPOINTMENT_STATUS.SCHEDULED,
            cancel_reason: null,
            cancel_note: null,
            ...APPOINTMENT_BOOKING_MESSAGES_RESET,
          },
        },
        'undo-check-in': {
          from: [APPOINTMENT_STATUS.CHECKED_IN],
          set: { status: APPOINTMENT_STATUS.CONFIRMED, checked_in_at: null, ...OFF_THE_FLOOR },
        },
        stage: {
          from: [APPOINTMENT_STATUS.CHECKED_IN],
          stamp: ['visit_stage_changed_at'],
          parse: validateStageAppointment,
        },
        pause: { from: [APPOINTMENT_STATUS.CHECKED_IN], stamp: ['visit_paused_at'] },
        resume: { from: [APPOINTMENT_STATUS.CHECKED_IN], set: { visit_paused_at: null } },
      },
      ...createAppointmentsRules(repository),
    });
  }

  /**
   * Books again on another day (route 17, A7): the booking's contact, branch, people, places,
   * service and length at the new `appointment_date` and `start_time`, through the create path —
   * the slot rules and the clash 409s — with `copied_from_appointment_id`. Works on any live booking.
   */
  async copy(
    scope: OrganizationPrincipalDatabaseScope,
    publicId: string,
    body: unknown,
    actingUserPublicId: string | undefined,
    visibility?: BaseRecordVisibility,
  ): Promise<AppointmentOutput> {
    const { appointment_date, start_time } = parseWithSchema(copyAppointmentDto, body ?? {});
    return withAppDatabaseContext(scope, async () => {
      const source = await this.get(scope, publicId, actingUserPublicId, visibility);
      return this.create(
        scope,
        {
          contact_id: source.contact_id,
          branch_id: source.branch_id,
          doctor_membership_id: source.doctor_membership_id,
          appointment_date,
          start_time,
          type: source.type,
          offering_id: source.offering_id,
          service_label: source.service_label,
          therapist_membership_id: source.therapist_membership_id,
          branch_room_id: source.branch_room_id,
          branch_machine_id: source.branch_machine_id,
          duration_minutes: source.duration_minutes,
          reason: source.reason,
          copied_from_appointment_id: source.id,
        },
        actingUserPublicId,
        undefined,
        visibility,
        'copy',
      );
    });
  }
}
