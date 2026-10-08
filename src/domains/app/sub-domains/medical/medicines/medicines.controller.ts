import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { MedicinesService } from './medicines.service.js';
import type { MedicineOutput } from './medicines.types.js';

/** HTTP handlers for the `medicines` routes — {@link BaseRecordController} on {@link MedicinesService}. */
export class MedicinesController extends BaseRecordController<MedicineOutput> {
  constructor(service: MedicinesService) {
    super(service, {
      resource: 'medicine',
      idParam: 'medicine_id',
      readPermission: APP_PERMISSIONS.MEDICINE_READ,
      exportName: 'medicines',
    });
  }
}

/** The `medicines` controller the routes register. */
export function createMedicinesController(service: MedicinesService): MedicinesController {
  return new MedicinesController(service);
}
