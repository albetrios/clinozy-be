import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds, withInstants } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateAppointmentDto,
  type CreateAppointmentInput,
  listAppointmentsQueryDto,
  UpdateAppointmentDto,
  type UpdateAppointmentInput,
  statusAppointmentDto,
  cancelAppointmentDto,
} from './appointments.dto.js';

/** Parses a appointment create body; throws `ValidationError` naming each bad field. */
export function validateCreateAppointment(data: unknown): CreateAppointmentInput {
  return withInstants(parseWithSchema(CreateAppointmentDto, data), ['follow_up_at']);
}

/** Parses a appointment update body; throws `ValidationError` naming each bad field. */
export function validateUpdateAppointment(data: unknown): UpdateAppointmentInput {
  return withInstants(parseWithSchema(UpdateAppointmentDto, data), ['follow_up_at']);
}

/** Parses the `GET /app/appointments` query into a list input (filters by column). */
export function validateListAppointmentsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listAppointmentsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    branchPublicIds: splitRecordIds(query.branch_ids),
    equals: {
      type: query.type,
      status: query.status,
    },
    referenceEquals: {
      patient_id: query.patient_id,
      lead_id: query.lead_id,
      branch_id: query.branch_id,
      doctor_membership_id: query.doctor_membership_id,
      room_id: query.room_id,
      machine_id: query.machine_id,
    },
    ranges: {
      appointment_date: { from: query.appointment_date_from, to: query.appointment_date_to },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}

/** Parses the body of the `status` action. */
export function validateStatusAppointment(data: unknown): Record<string, unknown> {
  return parseWithSchema(statusAppointmentDto, data ?? {});
}

/** Parses the body of the `cancel` action. */
export function validateCancelAppointment(data: unknown): Record<string, unknown> {
  return parseWithSchema(cancelAppointmentDto, data ?? {});
}
