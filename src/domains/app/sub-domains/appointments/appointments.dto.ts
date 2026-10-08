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
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  APPOINTMENT_CANCEL_REASON_VALUES,
  APPOINTMENT_DURATION_MAX,
  APPOINTMENT_DURATION_MIN,
  APPOINTMENT_DURATION_STEP,
  APPOINTMENT_NOTES_MAX,
  APPOINTMENT_STATUS_VALUES,
  APPOINTMENT_TYPE_VALUES,
  APPOINTMENT_VISIT_STAGE_VALUES,
} from './appointments.constants.js';

/** A booking's length: 5–240 minutes, a multiple of 5 (A13). */
const durationSchema = z
  .number()
  .int()
  .min(APPOINTMENT_DURATION_MIN)
  .max(APPOINTMENT_DURATION_MAX)
  .refine((value) => value % APPOINTMENT_DURATION_STEP === 0, {
    message: 'A multiple of 5 minutes',
  });

/** The fields a booking is written with (6.8 #5, #7) — each optional; create and update narrow them. */
const appointmentFields = {
  branch_id: recordIdSchema,
  type: z.enum(APPOINTMENT_TYPE_VALUES),
  offering_id: recordIdSchema.nullable(),
  service_label: trimmedStringMinMax(1, 120),
  doctor_membership_id: recordIdSchema,
  therapist_membership_id: recordIdSchema.nullable(),
  branch_room_id: recordIdSchema.nullable(),
  branch_machine_id: recordIdSchema.nullable(),
  appointment_date: calendarDateSchema,
  start_time: hourMinuteSchema,
  duration_minutes: durationSchema,
  reason: trimmedStringMinMax(1, 160).nullable(),
  notes: trimmedString().max(APPOINTMENT_NOTES_MAX).nullable(),
  follow_up_at: instantSchema.nullable(),
};

/** Path params of the by-id `appointments` routes. */
export const appointmentsIdParamsDto = z
  .object({
    appointment_id: recordIdSchema,
  })
  .strict();

/** The create body's shape — the route body and the copy's internal create share it. */
const createAppointmentShape = {
  contact_id: recordIdSchema,
  branch_id: appointmentFields.branch_id,
  doctor_membership_id: appointmentFields.doctor_membership_id,
  appointment_date: appointmentFields.appointment_date.optional(),
  start_time: appointmentFields.start_time.optional(),
  type: appointmentFields.type.optional(),
  offering_id: appointmentFields.offering_id.optional(),
  service_label: appointmentFields.service_label.optional(),
  therapist_membership_id: appointmentFields.therapist_membership_id.optional(),
  branch_room_id: appointmentFields.branch_room_id.optional(),
  branch_machine_id: appointmentFields.branch_machine_id.optional(),
  duration_minutes: appointmentFields.duration_minutes.optional(),
  reason: appointmentFields.reason.optional(),
  notes: appointmentFields.notes.optional(),
  follow_up_at: appointmentFields.follow_up_at.optional(),
  is_walk_in: z.boolean().optional(),
};

/** A booking names its date and start; a walk-in does not — the server places it at now (A6). */
function checkPlacement(
  value: {
    is_walk_in?: boolean | undefined;
    appointment_date?: string | undefined;
    start_time?: string | undefined;
  },
  context: z.RefinementCtx,
): void {
  for (const field of ['appointment_date', 'start_time'] as const) {
    if (value.is_walk_in === true && value[field] !== undefined) {
      context.addIssue({ code: 'custom', path: [field], message: 'A walk-in is placed at now' });
    }
    if (value.is_walk_in !== true && value[field] === undefined) {
      context.addIssue({ code: 'custom', path: [field], message: 'Required for a booking' });
    }
  }
}

/**
 * Body of `POST /app/appointments` (routes-final 6.8 #5): a booking — `contact_id`, `branch_id`,
 * `doctor_membership_id`, `appointment_date` and `start_time` — or a walk-in (`is_walk_in`, no date
 * or start: the server places it at now, A6).
 */
export const CreateAppointmentDto = z
  .object(createAppointmentShape)
  .strict()
  .superRefine(checkPlacement);

/**
 * The copy's create (route 17, A7) — the create body plus the booking it was copied from; never a
 * route body of its own.
 */
export const CopiedAppointmentDto = z
  .object({ ...createAppointmentShape, copied_from_appointment_id: recordIdSchema })
  .strict()
  .superRefine(checkPlacement);

/**
 * Body of `PATCH /app/appointments/{appointment_id}` (6.8 #7): any field of the create but
 * `contact_id` and `is_walk_in` (at least one; null clears an optional one); `expected_updated_at`
 * refuses a stale save (D43).
 */
export const UpdateAppointmentDto = z
  .object({
    branch_id: appointmentFields.branch_id.optional(),
    type: appointmentFields.type.optional(),
    offering_id: appointmentFields.offering_id.optional(),
    service_label: appointmentFields.service_label.optional(),
    doctor_membership_id: appointmentFields.doctor_membership_id.optional(),
    therapist_membership_id: appointmentFields.therapist_membership_id.optional(),
    branch_room_id: appointmentFields.branch_room_id.optional(),
    branch_machine_id: appointmentFields.branch_machine_id.optional(),
    appointment_date: appointmentFields.appointment_date.optional(),
    start_time: appointmentFields.start_time.optional(),
    duration_minutes: appointmentFields.duration_minutes.optional(),
    reason: appointmentFields.reason.optional(),
    notes: appointmentFields.notes.optional(),
    follow_up_at: appointmentFields.follow_up_at.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of the appointments list and export (routes-final 6.8 #1, #2) — and the clinic floor
 * (`status=checked_in&visit_stage=…`). `appointment_date_from` / `_to` are whole days, both
 * inclusive (A8); sort `appointment_date` (default: date, then start, ascending) |
 * `visit_stage_changed_at` | `created_at`. The saved-view registry checks a view's `filters` against it.
 */
export const listAppointmentsQueryDto = listSearchSortSchema([
  'appointment_date',
  'visit_stage_changed_at',
  'created_at',
] as const)
  .extend({
    contact_id: recordIdSchema.optional(),
    branch_id: recordIdSchema.optional(),
    branch_ids: recordIdListSchema.optional(),
    doctor_membership_id: recordIdSchema.optional(),
    branch_room_id: recordIdSchema.optional(),
    branch_machine_id: recordIdSchema.optional(),
    offering_id: recordIdSchema.optional(),
    type: z.enum(APPOINTMENT_TYPE_VALUES).optional(),
    status: valueListSchema(APPOINTMENT_STATUS_VALUES).optional(),
    visit_stage: valueListSchema(APPOINTMENT_VISIT_STAGE_VALUES).optional(),
    is_walk_in: z.enum(['true', 'false']).optional(),
    appointment_date_from: calendarDateSchema.optional(),
    appointment_date_to: calendarDateSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Body of `POST /app/appointments/{appointment_id}/cancel` (6.8 #14). */
export const cancelAppointmentDto = z
  .object({
    cancel_reason: z.enum(APPOINTMENT_CANCEL_REASON_VALUES),
    cancel_note: trimmedStringMinMax(1, 280).optional(),
  })
  .strict();

/** Body of `POST /app/appointments/{appointment_id}/copy` (6.8 #17) — the new booking's day and start. */
export const copyAppointmentDto = z
  .object({
    appointment_date: calendarDateSchema,
    start_time: hourMinuteSchema,
  })
  .strict();

/** Body of `POST /app/appointments/{appointment_id}/stage` (6.8 #18) — a later floor stage (A11). */
export const stageAppointmentDto = z
  .object({
    visit_stage: z.enum(APPOINTMENT_VISIT_STAGE_VALUES),
  })
  .strict();

/** Query of `GET /app/appointments/slots` (6.8 #3). */
export const slotsAppointmentsQueryDto = z
  .object({
    branch_id: recordIdSchema,
    appointment_date: calendarDateSchema,
    duration_minutes: z.coerce
      .number()
      .int()
      .min(APPOINTMENT_DURATION_MIN)
      .max(APPOINTMENT_DURATION_MAX),
    doctor_membership_id: recordIdSchema.optional(),
    branch_room_id: recordIdSchema.optional(),
    branch_machine_id: recordIdSchema.optional(),
    step_minutes: z.coerce.number().int().min(5).max(60).optional(),
  })
  .strict();

/** Query of `GET /app/appointments/daily-counts` (6.8 #4) — both days inclusive, up to 62 days. */
export const dailyCountsAppointmentsQueryDto = z
  .object({
    date_from: calendarDateSchema,
    date_to: calendarDateSchema,
    branch_ids: recordIdListSchema.optional(),
    doctor_membership_id: recordIdSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateAppointmentDto}. */
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentDto>;
/** Parsed {@link UpdateAppointmentDto}. */
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentDto>;
