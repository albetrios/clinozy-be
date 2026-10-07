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
  statusAppointmentDto,
} from './appointments.dto.js';

/** Registers the `appointments` routes (prefix `/api/v1/app`). */
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
            "Returns one page of the active organization's appointments (newest first by default), with the total count; `q` searches, filters narrow. Requires appointment:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export appointments',
          description:
            'Returns the appointments the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and appointment:read.',
          tags: ['Appointment'],
          querystring: listAppointmentsQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/appointments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create appointment',
          description:
            'Adds a appointment to the active organization. Requires appointment:create.',
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
            'Returns one appointment of the active organization. Requires appointment:read.',
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
          summary: 'Update appointment',
          description:
            "Changes any of a appointment's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires appointment:update.",
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
          body: UpdateAppointmentDto,
        },
      },
      controller.update,
    );
    zodApplication.post<{ Params: { appointment_id: string } }>(
      '/appointments/:appointment_id/status',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Set appointment status',
          description:
            'Moves an appointment on: confirmed, checked in, completed or no-show (no-show only after the start, D30). A appointment whose status does not allow it is a 409. Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
          body: statusAppointmentDto,
        },
      },
      controller.transition('status'),
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
            'Cancels an appointment with a reason; its slot is released and reminders stop. A appointment whose status does not allow it is a 409. Requires appointment:update.',
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
            'Undoes a cancel \u2014 the appointment is scheduled again (named apart from the delete undo). A appointment whose status does not allow it is a 409. Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.transition('reinstate'),
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
            'Books the same visit again (patient or lead, service, doctor, room, machine, length) on another date and time \u2014 the new appointment names the one it copies; the slot rules apply (appointments.4). Answers the new appointment. A appointment whose status does not allow it is a 409. Requires appointment:create.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
          body: copyAppointmentDto,
        },
      },
      controller.transition('copy'),
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
            'Takes back a check-in made by mistake. A appointment whose status does not allow it is a 409. Requires appointment:update.',
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.transition('undo-check-in'),
    );
    zodApplication.get(
      '/appointments/slots',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List free slots',
          description:
            "The start times a booking of `duration_minutes` fits on a date: inside the branch hours and working days, outside its holidays, and clear of the doctor's, room's and machine's other appointments (cancelled and no-show ones free their slot); today starts from now. Every `step_minutes` (15). A closed day answers `is_open: false` with `closed_reason` `past`, `branch_inactive`, `not_working_day`, `holiday` (with its `closed_label`) or `doctor_off`. Answers `{ appointment_date, is_open, closed_reason, closed_label, slots: [{ start_time, end_time }] }`. Requires appointment:read.",
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
          summary: 'Count appointments per day',
          description:
            "For the calendar's month and week views: per date in [date_from, date_to] (at most 62 days), the total and the count per status \u2014 in the caller's branches unless they hold branch:read. Answers `[{ appointment_date, total, by_status }]`. Requires appointment:read.",
          tags: ['Appointment'],
          querystring: dailyCountsAppointmentsQueryDto,
        },
      },
      controller.collectionView('daily-counts'),
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
            "Soft-deletes a appointment with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires appointment:delete.",
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
            "Undoes a appointment's delete. A live appointment is a 409. Requires appointment:delete.",
          tags: ['Appointment'],
          params: appointmentsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
