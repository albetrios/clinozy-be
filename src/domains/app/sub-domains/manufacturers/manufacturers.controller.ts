import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { ManufacturersService } from './manufacturers.service.js';
import type { ManufacturerOutput } from './manufacturers.types.js';

/** HTTP handlers for the `manufacturers` routes — {@link BaseRecordController} on {@link ManufacturersService}. */
export class ManufacturersController extends BaseRecordController<ManufacturerOutput> {
  constructor(service: ManufacturersService) {
    super(service, { resource: 'manufacturer', idParam: 'manufacturer_id' });
  }
}

/** The `manufacturers` controller the routes register. */
export function createManufacturersController(
  service: ManufacturersService,
): ManufacturersController {
  return new ManufacturersController(service);
}
