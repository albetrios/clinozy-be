import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { StockVendorsRepository } from './stock-vendors.repository.js';
import { serializeStockVendor } from './stock-vendors.serializer.js';
import type { StockVendorOutput } from './stock-vendors.types.js';
import {
  validateCreateStockVendor,
  validateListStockVendorsQuery,
  validateUpdateStockVendor,
} from './stock-vendors.validator.js';

/**
 * Stock vendors of the active organization (launch ROUTE #53): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Stock vendor')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
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
    });
  }
}
