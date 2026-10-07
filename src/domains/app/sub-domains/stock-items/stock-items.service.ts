import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { stock_vendors } from '@/domains/app/sub-domains/stock-vendors/stock-vendors.schema.js';
import type { StockItemsRepository } from './stock-items.repository.js';
import { serializeStockItem } from './stock-items.serializer.js';
import type { StockItemOutput } from './stock-items.types.js';
import {
  validateCreateStockItem,
  validateListStockItemsQuery,
  validateUpdateStockItem,
} from './stock-items.validator.js';

/**
 * Stock items of the active organization (launch ROUTE #54): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Stock item')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class StockItemsService extends BaseRecordService<StockItemOutput> {
  constructor(organizationService: OrganizationService, repository: StockItemsRepository) {
    super(organizationService, {
      label: 'Stock item',
      repository,
      parseCreate: validateCreateStockItem,
      parseUpdate: validateUpdateStockItem,
      parseList: validateListStockItemsQuery,
      serialize: serializeStockItem,
      references: [{ field: 'stock_vendor_id', table: stock_vendors, label: 'stock vendor' }],
    });
  }
}
