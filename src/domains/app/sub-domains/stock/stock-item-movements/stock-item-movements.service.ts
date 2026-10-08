import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { stock_counts } from '@/domains/app/sub-domains/stock/stock-counts/stock-counts.schema.js';
import { stock_items } from '@/domains/app/sub-domains/stock/stock-items/stock-items.schema.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.schema.js';
import type { StockItemMovementsRepository } from './stock-item-movements.repository.js';
import { createStockItemMovementsRules } from './stock-item-movements.rules.js';
import { stock_item_movements } from './stock-item-movements.schema.js';
import { serializeStockItemMovement } from './stock-item-movements.serializer.js';
import type { StockItemMovementOutput } from './stock-item-movements.types.js';
import {
  refuseStockItemMovementUpdate,
  validateCreateStockItemMovement,
  validateListStockItemMovementsQuery,
} from './stock-item-movements.validator.js';

/**
 * Every change to a stock item's quantity (launch ROUTE #137, routes-final 9.B): the Movements
 * tab, an item's history, a use, receipt, damage, return or adjustment by hand, one movement, and
 * its revert.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.stock_item_movements` — listed on
 *   its own and under its item (`stock_item_id`, the parent); append-only (never changed or
 *   deleted — reverted, S5, S8). The treatment, purchase, count, revert link and author are
 *   references. Reading needs `stock_item:read`, writing and reverting `stock_item:update` (the
 *   routes' gates, S2).
 * - **Failure modes:** `NotFoundError('Stock item' | 'Stock item movement')`; `ValidationError`
 *   for a bad body or query; `ConflictError` per the rules.
 */
export class StockItemMovementsService extends BaseRecordService<StockItemMovementOutput> {
  constructor(organizationService: OrganizationService, repository: StockItemMovementsRepository) {
    super(organizationService, {
      label: 'Stock item movement',
      repository,
      parseCreate: validateCreateStockItemMovement,
      parseUpdate: refuseStockItemMovementUpdate,
      parseList: validateListStockItemMovementsQuery,
      serialize: serializeStockItemMovement,
      parent: { field: 'stock_item_id', table: stock_items, label: 'Stock item' },
      references: [
        { field: 'stock_item_id', table: stock_items, label: 'stock item' },
        { field: 'patient_treatment_id', table: patient_treatments, label: 'treatment' },
        { field: 'stock_purchase_id', table: stock_purchases, label: 'stock purchase' },
        { field: 'stock_count_id', table: stock_counts, label: 'stock count' },
        {
          field: 'reverts_stock_item_movement_id',
          table: stock_item_movements,
          label: 'stock item movement',
        },
        { field: 'author_membership_id', table: memberships, label: 'team member' },
      ],
      ...createStockItemMovementsRules(repository),
    });
  }
}
