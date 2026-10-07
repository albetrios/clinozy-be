import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  hourMinuteSchema,
  instantSchema,
  recordIdListSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  APPOINTMENT_TYPE_VALUES,
  APPOINTMENT_STATUS_VALUES,
  APPOINTMENT_CANCEL_REASON_VALUES,
} from './appointments.constants.js';

/** Path params of the by-id `appointments` routes. */
export const appointmentsIdParamsDto = z
  .object({
    appointment_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new appointment. */
export const CreateAppointmentDto = z
  .object({
    patient_id: recordIdSchema.nullable().optional(),
    lead_id: recordIdSchema.nullable().optional(),
    branch_id: recordIdSchema,
    type: z.enum(APPOINTMENT_TYPE_VALUES).optional(),
    offering_id: recordIdSchema.nullable().optional(),
    service_label: trimmedStringMinMax(1, 120),
    doctor_membership_id: recordIdSchema,
    therapist_membership_id: recordIdSchema.nullable().optional(),
    room_id: recordIdSchema.nullable().optional(),
    machine_id: recordIdSchema.nullable().optional(),
    appointment_date: calendarDateSchema,
    start_time: hourMinuteSchema,
    duration_minutes: z.number().int().min(5).max(240).optional(),
    reason: trimmedStringMinMax(1, 160).nullable().optional(),
    notes: trimmedString().max(2000).nullable().optional(),
    follow_up_at: instantSchema.nullable().optional(),
    patient_package_id: recordIdSchema.nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/appointments/{appointment_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateAppointmentDto = z
  .object({
    patient_id: recordIdSchema.nullable().optional(),
    lead_id: recordIdSchema.nullable().optional(),
    branch_id: recordIdSchema.optional(),
    type: z.enum(APPOINTMENT_TYPE_VALUES).optional(),
    offering_id: recordIdSchema.nullable().optional(),
    service_label: trimmedStringMinMax(1, 120).optional(),
    doctor_membership_id: recordIdSchema.optional(),
    therapist_membership_id: recordIdSchema.nullable().optional(),
    room_id: recordIdSchema.nullable().optional(),
    machine_id: recordIdSchema.nullable().optional(),
    appointment_date: calendarDateSchema.optional(),
    start_time: hourMinuteSchema.optional(),
    duration_minutes: z.number().int().min(5).max(240).optional(),
    reason: trimmedStringMinMax(1, 160).nullable().optional(),
    notes: trimmedString().max(2000).nullable().optional(),
    follow_up_at: instantSchema.nullable().optional(),
    patient_package_id: recordIdSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `appointments` list — keyset paging, `q` search, sort and filters. */
export const listAppointmentsQueryDto = listSearchSortSchema([
  'created_at',
  'appointment_date',
] as const)
  .extend({
    patient_id: recordIdSchema.optional(),
    lead_id: recordIdSchema.optional(),
    branch_id: recordIdSchema.optional(),
    type: z.enum(APPOINTMENT_TYPE_VALUES).optional(),
    doctor_membership_id: recordIdSchema.optional(),
    room_id: recordIdSchema.optional(),
    machine_id: recordIdSchema.optional(),
    appointment_date_from: calendarDateSchema.optional(),
    appointment_date_to: calendarDateSchema.optional(),
    status: z.enum(APPOINTMENT_STATUS_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
    branch_ids: recordIdListSchema.optional(),
  })
  .strict();

/** Body of `POST /app/appointments/{appointment_id}/status`. */
export const statusAppointmentDto = z
  .object({
    status: z.enum(['confirmed', 'checked_in', 'completed', 'no_show']),
  })
  .strict();

/** Body of `POST /app/appointments/{appointment_id}/cancel`. */
export const cancelAppointmentDto = z
  .object({
    cancel_reason: z.enum(APPOINTMENT_CANCEL_REASON_VALUES),
    cancel_note: trimmedString().max(280).optional(),
  })
  .strict();

/** Parsed {@link CreateAppointmentDto}. */
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentDto>;
/** Parsed {@link UpdateAppointmentDto}. */
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentDto>;
