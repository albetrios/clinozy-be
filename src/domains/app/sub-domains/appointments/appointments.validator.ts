import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { readContactLinkedSearch } from '@/domains/app/sub-domains/contacts/contacts.validator.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  addDaysToCalendarDate,
  splitRecordIds,
  withInstants,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  cancelAppointmentDto,
  CopiedAppointmentDto,
  CreateAppointmentDto,
  type CreateAppointmentInput,
  listAppointmentsQueryDto,
  stageAppointmentDto,
  UpdateAppointmentDto,
  type UpdateAppointmentInput,
} from './appointments.dto.js';

/** Parses an appointment create body (a booking or a walk-in); throws `ValidationError` naming each bad field. */
export function validateCreateAppointment(data: unknown): CreateAppointmentInput {
  return withInstants(parseWithSchema(CreateAppointmentDto, data), ['follow_up_at']);
}

/** Parses the copy's internal create — the create body plus `copied_from_appointment_id` (A7). */
export function validateCopiedAppointment(data: unknown): Record<string, unknown> {
  return withInstants(parseWithSchema(CopiedAppointmentDto, data), ['follow_up_at']);
}

/** Parses an appointment update body; throws `ValidationError` naming each bad field. */
export function validateUpdateAppointment(data: unknown): UpdateAppointmentInput {
  return withInstants(parseWithSchema(UpdateAppointmentDto, data), ['follow_up_at']);
}

/**
 * Parses the `GET /app/appointments` query into a list input (routes-final 6.8 #1, A8): `q` through
 * the service label, the contact (names, numbers, `C-12345`) and the appointment number (`#2841`);
 * `status` and `visit_stage` take several values; the date range is whole days, both inclusive.
 */
export function validateListAppointmentsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listAppointmentsQueryDto, data);
  const search = readContactLinkedSearch(query.q);
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    branchPublicIds: splitRecordIds(query.branch_ids),
    equals: {
      type: query.type,
      status: query.status?.split(','),
      visit_stage: query.visit_stage?.split(','),
      is_walk_in: query.is_walk_in === undefined ? undefined : query.is_walk_in === 'true',
    },
    referenceEquals: {
      contact_id: query.contact_id,
      branch_id: query.branch_id,
      doctor_membership_id: query.doctor_membership_id,
      branch_room_id: query.branch_room_id,
      branch_machine_id: query.branch_machine_id,
      offering_id: query.offering_id,
    },
    derived: { search: search === undefined ? undefined : { ...search, label: query.q } },
    ranges: {
      appointment_date: {
        from: query.appointment_date_from,
        to:
          query.appointment_date_to === undefined
            ? undefined
            : addDaysToCalendarDate({ date: query.appointment_date_to, days: 1 }),
      },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}

/** Parses the body of the `cancel` action. */
export function validateCancelAppointment(data: unknown): Record<string, unknown> {
  return parseWithSchema(cancelAppointmentDto, data ?? {});
}

/** Parses the body of the `stage` action. */
export function validateStageAppointment(data: unknown): Record<string, unknown> {
  return parseWithSchema(stageAppointmentDto, data ?? {});
}
