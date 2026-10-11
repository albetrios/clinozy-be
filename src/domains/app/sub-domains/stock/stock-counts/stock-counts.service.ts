import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { memberReference } from '@/domains/app/app-member-reference.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { StockCountsRepository } from './stock-counts.repository.js';
import { createStockCountsRules } from './stock-counts.rules.js';
import { serializeStockCount } from './stock-counts.serializer.js';
import type { StockCountOutput } from './stock-counts.types.js';
import {
  refuseStockCountUpdate,
  validateCreateStockCount,
  validateListStockCountsQuery,
} from './stock-counts.validator.js';

/**
 * Stock checks (launch ROUTE #137, routes-final 9.C): past checks, save one — it adjusts what
 * differs — and read one.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.stock_counts` — the
 *   organization's, no branch (S3); never changed or deleted (it moved stock, S9); the author is a
 *   reference. Reading needs `stock_item:read`, saving `stock_item:update` (the routes' gates, S2).
 * - **Failure modes:** `NotFoundError('Stock count')`; `ValidationError` for a bad body or query
 *   or per the rules.
 */
export class StockCountsService extends BaseRecordService<StockCountOutput> {
  constructor(organizationService: OrganizationService, repository: StockCountsRepository) {
    super(organizationService, {
      label: 'Stock count',
      repository,
      parseCreate: validateCreateStockCount,
      parseUpdate: refuseStockCountUpdate,
      parseList: validateListStockCountsQuery,
      serialize: serializeStockCount,
      references: [memberReference('author_membership_id')],
      ...createStockCountsRules(repository),
    });
  }
}
