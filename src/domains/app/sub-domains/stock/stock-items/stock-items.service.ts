import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import { stock_vendors } from '@/domains/app/sub-domains/stock/stock-vendors/stock-vendors.schema.js';
import type { StockItemsRepository } from './stock-items.repository.js';
import { assertStockItemValues, createStockItemsRules } from './stock-items.rules.js';
import { serializeStockItem } from './stock-items.serializer.js';
import type { StockItemOutput } from './stock-items.types.js';
import {
  validateCreateStockItem,
  validateListStockItemsQuery,
  validateUpdateStockItem,
} from './stock-items.validator.js';

/**
 * The clinic's consumables and equipment (launch ROUTE #137, routes-final 9.A): the Items tab and
 * its CSV, add with an opening quantity, read, change (never the quantity), delete at zero,
 * restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.stock_items` — the
 *   organization's, no branch (S3); the vendor is a reference; the rules write the opening
 *   movement and refuse a delete while stock is left (S5, S6). A create answers with the item as
 *   its opening left it. Reading needs `stock_item:read`, the CSV `stock_item:export`, adding
 *   `stock_item:create`, changing `stock_item:update`, deleting and restoring `stock_item:delete`
 *   (the routes' gates, S2).
 * - **Failure modes:** `NotFoundError('Stock item')`; `ValidationError` for a bad body or query, a
 *   vendor that is no live record here, a size without its measure or a maximum under the
 *   minimum; `ConflictError` for a taken name, a stale save, stock left on delete, or a restore of
 *   a live item or over a reused name.
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
      conflicts: {
        idx_stock_items_organization_name_unique: {
          key: 'errors:recordAlreadyExists',
          reason: 'record_already_exists',
        },
      },
      checkValues: assertStockItemValues,
      ...createStockItemsRules(),
    });
  }

  /** S6: adds an item and answers with it as its opening movement left it. */
  override async create({
    scope,
    body,
    actingUserPublicId,
    parentPublicId,
    visibility,
    createName,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
    actingUserPublicId: string | undefined;
    parentPublicId?: string | undefined;
    visibility?: BaseRecordVisibility | undefined;
    createName?: string | undefined;
  }): Promise<StockItemOutput> {
    const created = await super.create({
      scope,
      body,
      actingUserPublicId,
      parentPublicId,
      visibility,
      createName,
    });
    return this.get({ scope, publicId: created.id, actingUserPublicId, visibility });
  }
}
