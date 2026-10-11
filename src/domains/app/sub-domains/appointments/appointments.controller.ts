import type { FastifyReply, FastifyRequest } from 'fastify';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getRequestIdentifier,
  requireOrganizationScope,
} from '@/shared/utils/http/request.util.js';
import type { AppointmentsService } from './appointments.service.js';
import type { AppointmentOutput } from './appointments.types.js';

/**
 * HTTP handlers for the `appointments` routes — {@link BaseRecordController} on
 * {@link AppointmentsService}, plus `copy` (book again through the create path, A7). The export needs
 * `appointment:read` with its own `appointment:export` gate (A9).
 */
export class AppointmentsController extends BaseRecordController<AppointmentOutput> {
  constructor(private readonly appointments: AppointmentsService) {
    super(appointments, {
      resource: 'appointment',
      idParam: 'appointment_id',
      readPermission: APP_PERMISSIONS.APPOINTMENT_READ,
      exportName: 'appointments',
    });
  }

  /** `POST …/{appointment_id}/copy` — the new booking; audited as a copy of the source. */
  readonly copy = async (request: FastifyRequest, _reply: FastifyReply) => {
    const publicId = this.readId(request);
    const data = await this.appointments.copy({
      scope: requireOrganizationScope(request),
      publicId,
      body: request.body,
      actingUserPublicId: this.actor(request),
      visibility: await this.visibility(request),
    });
    await this.audit({ request, verb: 'copy', publicId, metadata: { copy_public_id: data.id } });
    return successResponse({
      data: await this.present({ request, output: data }),
      request_id: getRequestIdentifier(request),
    });
  };
}

/** The `appointments` controller the routes register. */
export function createAppointmentsController(service: AppointmentsService): AppointmentsController {
  return new AppointmentsController(service);
}
