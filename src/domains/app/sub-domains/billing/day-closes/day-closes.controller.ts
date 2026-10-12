import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { DayClosesService } from './day-closes.service.js';
import type { DayCloseOutput } from './day-closes.types.js';

/** HTTP handlers for the `day-closes` routes — {@link BaseRecordController} on {@link DayClosesService}. */
export class DayClosesController extends BaseRecordController<DayCloseOutput> {
  constructor(service: DayClosesService) {
    super(service, {
      resource: 'day_close',
      idParam: 'day_close_id',
      readPermission: APP_PERMISSIONS.PAYMENT_READ,
    });
  }
}

/** The `day-closes` controller the routes register. */
export function createDayClosesController(service: DayClosesService): DayClosesController {
  return new DayClosesController(service);
}
