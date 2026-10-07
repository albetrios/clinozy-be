import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { OfferingsService } from './offerings.service.js';
import type { OfferingOutput } from './offerings.types.js';

/** HTTP handlers for the `offerings` routes — {@link BaseRecordController} on {@link OfferingsService}. */
export class OfferingsController extends BaseRecordController<OfferingOutput> {
  constructor(service: OfferingsService) {
    super(service, {
      resource: 'offering',
      idParam: 'offering_id',
      hiddenFields: { min_price: APP_PERMISSIONS.LOWEST_PRICE_READ },
      guardedFields: {
        price: APP_PERMISSIONS.PRICE_MANAGE,
        min_price: APP_PERMISSIONS.PRICE_MANAGE,
        offer_price: APP_PERMISSIONS.PRICE_MANAGE,
      },
      readPermission: TENANCY_PERMISSIONS.ORGANIZATION_READ,
      exportName: 'offerings',
    });
  }
}

/** The `offerings` controller the routes register. */
export function createOfferingsController(service: OfferingsService): OfferingsController {
  return new OfferingsController(service);
}
