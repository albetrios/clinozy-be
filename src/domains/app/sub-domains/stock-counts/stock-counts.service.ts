import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { StockCountsRepository } from './stock-counts.repository.js';
import { serializeStockCount } from './stock-counts.serializer.js';
import type { StockCountOutput } from './stock-counts.types.js';
import {
  validateCreateStockCount,
  validateListStockCountsQuery,
  validateUpdateStockCount,
} from './stock-counts.validator.js';

/**
 * Stock counts of the active organization (launch ROUTE #57): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Stock count')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class StockCountsService extends BaseRecordService<StockCountOutput> {
  constructor(organizationService: OrganizationService, repository: StockCountsRepository) {
    super(organizationService, {
      label: 'Stock count',
      repository,
      parseCreate: validateCreateStockCount,
      parseUpdate: validateUpdateStockCount,
      parseList: validateListStockCountsQuery,
      serialize: serializeStockCount,
    });
  }
}
