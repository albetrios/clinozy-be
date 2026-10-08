import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import { stock_vendors } from '@/domains/app/sub-domains/stock/stock-vendors/stock-vendors.schema.js';
import type { StockPurchasesRepository } from './stock-purchases.repository.js';
import { createStockPurchasesRules } from './stock-purchases.rules.js';
import { serializeStockPurchase } from './stock-purchases.serializer.js';
import type { StockPurchaseOutput } from './stock-purchases.types.js';
import {
  validateCreateStockPurchase,
  validateListStockPurchasesQuery,
  validateUpdateStockPurchase,
} from './stock-purchases.validator.js';

/**
 * Vendor bills for clinic stock (launch ROUTE #137, routes-final 9.D): the Purchases tab with what
 * is owed and its CSV, record one — it receives its lines and optionally pays — read, change the
 * bill details, delete while unpaid, restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.stock_purchases` — the
 *   organization's, no branch (S3); the vendor is a reference; the rules hold the lines, what they
 *   receive, the "Paid" and the delete (S10–S12). The list's `meta.due_total` is the open dues over
 *   every page. A create answers with the purchase as its "Paid" left it. Reading needs
 *   `stock_item:read`, the CSV `stock_item:export`, recording `stock_item:create` (and
 *   `payment:create` for "Paid"), changing `stock_item:update`, deleting and restoring
 *   `stock_item:delete` (the routes' gates, S2).
 * - **Failure modes:** `NotFoundError('Stock purchase')`; `ValidationError` for a bad body or
 *   query, a vendor that is no live record here, or per the rules; `ConflictError` per the rules,
 *   a stale save or a restore of a live purchase.
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
      listMeta: async ({ organizationId, query }) => ({
        due_total: await repository.sumOver({ organizationId, query, column: 'due_amount' }),
      }),
      ...createStockPurchasesRules(repository),
    });
  }

  /** S11: records a purchase and answers with it as its "Paid" left it. */
  override async create(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
    parentPublicId?: string,
    visibility?: BaseRecordVisibility,
    createName?: string,
  ): Promise<StockPurchaseOutput> {
    const created = await super.create(
      scope,
      body,
      actingUserPublicId,
      parentPublicId,
      visibility,
      createName,
    );
    return this.get(scope, created.id, actingUserPublicId, visibility);
  }
}
