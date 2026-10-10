import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { OfferingsService } from './offerings.service.js';
import type { OfferingOutput } from './offerings.types.js';

/**
 * HTTP handlers for the `offerings` routes — {@link BaseRecordController} on {@link OfferingsService}:
 * `min_price` reads `null` without `offering:lower_price:read` (O15) and only its holders may send
 * it — a 403 `field_permission_required` otherwise (D81), the export answers the list as CSV (O14).
 */
export class OfferingsController extends BaseRecordController<OfferingOutput> {
  constructor(service: OfferingsService) {
    super(service, {
      resource: 'offering',
      idParam: 'offering_id',
      hiddenFields: { min_price: APP_PERMISSIONS.OFFERING_LOWER_PRICE_READ },
      // D81: a member who cannot see the lowest price cannot write it either — not even blind
      guardedFields: { min_price: APP_PERMISSIONS.OFFERING_LOWER_PRICE_READ },
      readPermission: TENANCY_PERMISSIONS.ORGANIZATION_READ,
      exportName: 'offerings',
    });
  }
}

/** The `offerings` controller the routes register. */
export function createOfferingsController(service: OfferingsService): OfferingsController {
  return new OfferingsController(service);
}
