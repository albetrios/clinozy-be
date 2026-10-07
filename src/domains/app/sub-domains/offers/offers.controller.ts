import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { OffersService } from './offers.service.js';
import type { OfferOutput } from './offers.types.js';

/** HTTP handlers for the `offers` routes — {@link BaseRecordController} on {@link OffersService}. */
export class OffersController extends BaseRecordController<OfferOutput> {
  constructor(service: OffersService) {
    super(service, { resource: 'offer', idParam: 'offer_id' });
  }
}

/** The `offers` controller the routes register. */
export function createOffersController(service: OffersService): OffersController {
  return new OffersController(service);
}
