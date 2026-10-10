import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { AppointmentsService } from './appointments.service.js';
import { createAppointmentsController } from './appointments.controller.js';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  appointmentsIdParamsDto,
  cancelAppointmentDto,
  copyAppointmentDto,
  dailyCountsAppointmentsQueryDto,
  listAppointmentsQueryDto,
  slotsAppointmentsQueryDto,
  stageAppointmentDto,
} from './appointments.dto.js';

/** Registers the `appointments` routes (prefix `/api/v1/app`, routes-final 6.7 — 20 routes). */
export function appointmentsRoutes(service: AppointmentsService): FastifyPluginAsync {
  const controller = createAppointmentsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/appointments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List appointments',
          description:
            "Returns one page of the active organization's appointments, each with its contact's summary (`contact`) and the contact's patient file and open lead (`patient_id`, `lead_id`, A1). `q` searches the service, the contact's names, numbers and contact number (`C-12345`) and the appointment number (`#2841`) — text needs 3+ characters, a number 4+ digits. Filters: `contact_id`, `branch_id` (one) or `branch_ids` (several, comma-separated — the list form of the branch filter here; Tasks and Payments take a list in `branch_id`), `doctor_membership_id`, `branch_room_id`, `branch_machine_id`, `offering_id`, `type`, `status` and `visit_stage` (comma-separated — any of), `is_walk_in`, `appointment_date_from` / `appointment_date_to` (whole days, both inclusive, A8). The clinic floor is `status=checked_in` (with `visit_stage`, sorted by `visit_stage_changed_at`). Sort `appointment_date` (default: date, then start, ascending — the day view), `visit_stage_changed_at` (longest in a stage first) or `created_at` (newest first). A caller without `branch:read` sees their branches' appointments. Requires appointment:read.",
          tags: ['Appointment'],
          querystring: listAppointmentsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/appointments/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export appointments',
          description:
            'Returns the appointments the same filters and sort as the list would (every page, up to 5,000 rows; `limit` and `after` ignored) as a CSV file inside the JSON envelope (`file_name` `appointments-YYYY-MM-DD.csv`, `content_type`, `row_count`, `is_truncated`, `content`). Requires appointment:export (A9) and appointment:read.',
          tags: ['Appointment'],
          querystring: listAppointmentsQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.get(
      '/appointments/slots',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Free slots for a day',
          description:
            "Returns a day's free slots for a booking of `duration_minutes` at `branch_id`, every `step_minutes` (default 15): the branch's hours, working days and holidays, the doctor's working days and hours (A4), and the named doctor's, room's and machine's bookings. A closed day answers `is_open: false` with `closed_reason` (`past`, `branch_inactive`, `closed_day`, `holiday`, `doctor_off`) and the holiday's `closed_label`. A branch you cannot see is a 404. Requires appointment:read.",
          tags: ['Appointment'],
          querystring: slotsAppointmentsQueryDto,
        },
      },
      controller.collectionView('slots'),
    );
    zodApplication.get(
      '/appointments/daily-counts',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Daily appointment counts',
          description:
            'Returns one entry per day from `date_from` to `date_to` (both inclusive, up to 62 days — a 400 on `date_to` otherwise): `appointment_date`, `total` and `by_status` (every status, zeros included), within `branch_ids` and for `doctor_membership_id` when named. Requires appointment:read.',
          tags: ['Appointment'],
          querystring: dailyCountsAppointmentsQueryDto,
        },
      },
      controller.collectionView('daily-counts'),
    );
    zodApplication.post(
      '/appointments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Book an appointment',
          description:
            "Books a contact with a doctor at a branch: `contact_id`, `branch_id` (one of yours unless you hold branch:read), `doctor_membership_id`, `appointment_date`, `start_time`; optional `type`, `offering_id`, `service_label` (defaults to the offering's name — a 400 without either), `therapist_membership_id`, `branch_room_id` / `branch_machine_id` (of the same branch — a 400 otherwise, A2), `duration_minutes` (5–240, a multiple of 5), `reason`, `notes`, `follow_up_at`. A walk-in sends `is_walk_in: true` and no date or start: it is placed at now and checked in at once, exempt from clashes (A6). Refused with a 409: `slot_in_past`; `slot_closed` (the branch inactive, a closed day, a holiday, the doctor off or outside their hours — A4); `slot_outside_hours`; `slot_taken` when the doctor, room or machine is booked then (A3). The doctor and therapist handle the contact (CT11); a walk-in's check-in converts as route 11 does. Requires appointment:create.",
          tags: ['Appointment'],
          body: CreateAppointmentDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get appointment',
          description:
            "Returns one appointment with its contact summary, the contact's patient file and open lead, and the floor stage while checked in. An appointment in a branch you cannot see is a 404. Requires appointment:read.",
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change or move appointment',
          description:
            "Changes any field of the booking but `contact_id` and `is_walk_in` (at least one; null clears an optional one). Changing the branch, date, start, length, doctor, room or machine moves it: only a scheduled or confirmed booking moves (a 409 `appointment_not_movable`), the slot rules apply again (the create's 409s), a new date or start stamps `rescheduled_from`, adds one to `move_count` and returns a confirmed booking to `scheduled` (A5). Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires appointment:update.",
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
          body: UpdateAppointmentDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete appointment',
          description:
            "Soft-deletes a booking with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Its slot is free again. Restorable until the organization's purge window ends (D38). Requires appointment:delete.",
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore appointment',
          description:
            "Undoes a booking's delete. A live booking is a 409 `record_not_deleted`; a slot booked meanwhile is a 409 `slot_taken` (A3). Requires appointment:delete.",
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.restore,
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/confirm',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Confirm appointment',
          description:
            'They said yes: a scheduled booking becomes `confirmed` (a 409 `transition_not_allowed` otherwise, A5). Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.transition('confirm'),
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/check-in',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Check in',
          description:
            "They arrived: a scheduled or confirmed booking becomes `checked_in` at stage `waiting` (`checked_in_at` — the visit's start); a booking on a later day is a 409 `appointment_not_due`. Check-in converts (A14): the contact's open lead moves to `clinic_visited` (with a line in its activity) and a contact without a patient file gets one — home branch and usual doctor from the appointment. Requires appointment:update.",
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.transition('check-in'),
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/complete',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Complete appointment',
          description:
            'The visit is done: a checked-in booking becomes `completed` (`completed_at`; the floor stage cleared). Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.transition('complete'),
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/no-show',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Mark no-show',
          description:
            'They did not come: a scheduled or confirmed booking becomes `no_show` and frees its slot; before its start it is a 409 `appointment_not_due`. Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.transition('no-show'),
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/cancel',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Cancel appointment',
          description:
            'Cancels a scheduled or confirmed booking with `cancel_reason` (patient_asked, unreachable, doctor_unavailable, resource_unavailable, rescheduling_later, booked_by_mistake, other) and an optional `cancel_note`; its slot is free again. Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
          body: cancelAppointmentDto,
        },
      },
      controller.transition('cancel'),
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/reinstate',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Reinstate appointment',
          description:
            "Undoes a cancel: the booking is `scheduled` again if its slot is still bookable — the create's 409s (`slot_in_past`, `slot_closed`, `slot_outside_hours`, `slot_taken`). Requires appointment:update.",
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.transition('reinstate'),
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/undo-check-in',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Undo check-in',
          description:
            'Undoes a mistaken check-in while the visit is still `waiting` (a 409 `visit_started` after): the booking is `confirmed` again; the lead stays `clinic_visited` and the patient file stays. Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.transition('undo-check-in'),
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/copy',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Copy appointment',
          description:
            "Books again on another day (`appointment_date`, `start_time`): the booking's contact, branch, people, places, service and length, through the create path — every slot rule and 409 — with `copied_from_appointment_id` (A7). Works on any live booking; answers the new one. Requires appointment:create.",
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
          body: copyAppointmentDto,
        },
      },
      controller.copy,
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/stage',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Move floor stage',
          description:
            'Moves a checked-in visit to a later floor stage (`visit_stage`: waiting, with_doctor, treatment, checkout, pharmacy — skipping allowed, never back; a 409 `transition_not_allowed` otherwise, A11) and stamps `visit_stage_changed_at`. Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
          body: stageAppointmentDto,
        },
      },
      controller.transition('stage'),
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/pause',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Pause visit',
          description:
            'Pauses a running checked-in visit (`visit_paused_at`); a paused one, or a booking not checked in, is a 409 `transition_not_allowed` (A11). Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.transition('pause'),
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/resume',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Resume visit',
          description:
            'Resumes a paused visit; a running one, or a booking not checked in, is a 409 `transition_not_allowed` (A11). Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.transition('resume'),
    );
  };
}
