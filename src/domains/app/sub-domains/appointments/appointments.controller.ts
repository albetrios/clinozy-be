import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { AppointmentsService } from './appointments.service.js';
import type { AppointmentOutput } from './appointments.types.js';

/** HTTP handlers for the `appointments` routes — {@link BaseRecordController} on {@link AppointmentsService}. */
export class AppointmentsController extends BaseRecordController<AppointmentOutput> {
  constructor(service: AppointmentsService) {
    super(service, {
      resource: 'appointment',
      idParam: 'appointment_id',
      readPermission: APP_PERMISSIONS.APPOINTMENT_READ,
      exportName: 'appointments',
    });
  }
}

/** The `appointments` controller the routes register. */
export function createAppointmentsController(service: AppointmentsService): AppointmentsController {
  return new AppointmentsController(service);
}
