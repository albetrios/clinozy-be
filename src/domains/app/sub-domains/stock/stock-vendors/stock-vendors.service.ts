import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { StockVendorsRepository } from './stock-vendors.repository.js';
import { createStockVendorsRules } from './stock-vendors.rules.js';
import { serializeStockVendor } from './stock-vendors.serializer.js';
import type { StockVendorOutput } from './stock-vendors.types.js';
import {
  validateCreateStockVendor,
  validateListStockVendorsQuery,
  validateUpdateStockVendor,
} from './stock-vendors.validator.js';

/**
 * Who the clinic buys consumables from (launch ROUTE #137, routes-final 9.E): the picker, add,
 * read, change, delete with nothing owed, restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.stock_vendors` — the
 *   organization's, no branch (S3); the rules refuse a delete with open dues and add `payable`
 *   (S13). Reading needs `stock_item:read`, adding `stock_item:create`, changing
 *   `stock_item:update`, deleting and restoring `stock_item:delete` (the routes' gates, S2).
 * - **Failure modes:** `NotFoundError('Stock vendor')`; `ValidationError` for a bad body or query;
 *   `ConflictError` for a taken name, a stale save, open dues, or a restore of a live vendor or
 *   over a reused name.
 */
export class StockVendorsService extends BaseRecordService<StockVendorOutput> {
  constructor(organizationService: OrganizationService, repository: StockVendorsRepository) {
    super(organizationService, {
      label: 'Stock vendor',
      repository,
      parseCreate: validateCreateStockVendor,
      parseUpdate: validateUpdateStockVendor,
      parseList: validateListStockVendorsQuery,
      serialize: serializeStockVendor,
      conflicts: {
        idx_stock_vendors_organization_name_unique: {
          key: 'errors:recordAlreadyExists',
          reason: 'record_already_exists',
        },
      },
      ...createStockVendorsRules(repository),
    });
  }
}
