import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { stock_vendors } from '@/domains/app/sub-domains/stock-vendors/stock-vendors.schema.js';
import type { StockPurchasesRepository } from './stock-purchases.repository.js';
import { serializeStockPurchase } from './stock-purchases.serializer.js';
import type { StockPurchaseOutput } from './stock-purchases.types.js';
import {
  validateCreateStockPurchase,
  validateListStockPurchasesQuery,
  validateUpdateStockPurchase,
} from './stock-purchases.validator.js';

/**
 * Stock purchases of the active organization (launch ROUTE #55): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Stock purchase')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class StockPurchasesService extends BaseRecordService<StockPurchaseOutput> {
  constructor(organizationService: OrganizationService, repository: StockPurchasesRepository) {
    super(organizationService, {
      label: 'Stock purchase',
      repository,
      parseCreate: validateCreateStockPurchase,
      parseUpdate: validateUpdateStockPurchase,
      parseList: validateListStockPurchasesQuery,
      serialize: serializeStockPurchase,
      references: [{ field: 'stock_vendor_id', table: stock_vendors, label: 'stock vendor' }],
    });
  }
}
