import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { stock_counts } from '@/domains/app/sub-domains/stock-counts/stock-counts.schema.js';
import { stock_items } from '@/domains/app/sub-domains/stock-items/stock-items.schema.js';
import { stock_movements } from './stock-movements.schema.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock-purchases/stock-purchases.schema.js';
import type { StockMovementsRepository } from './stock-movements.repository.js';
import { serializeStockMovement } from './stock-movements.serializer.js';
import type { StockMovementOutput } from './stock-movements.types.js';
import {
  validateCreateStockMovement,
  validateListStockMovementsQuery,
  validateUpdateStockMovement,
} from './stock-movements.validator.js';

/**
 * Stock movements of the active organization (launch ROUTE #56): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Stock movement')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class StockMovementsService extends BaseRecordService<StockMovementOutput> {
  constructor(organizationService: OrganizationService, repository: StockMovementsRepository) {
    super(organizationService, {
      label: 'Stock movement',
      repository,
      parseCreate: validateCreateStockMovement,
      parseUpdate: validateUpdateStockMovement,
      parseList: validateListStockMovementsQuery,
      serialize: serializeStockMovement,
      references: [
        { field: 'stock_item_id', table: stock_items, label: 'stock item' },
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'stock_purchase_id', table: stock_purchases, label: 'stock purchase' },
        { field: 'stock_count_id', table: stock_counts, label: 'stock count' },
        { field: 'reverts_stock_movement_id', table: stock_movements, label: 'stock movement' },
        { field: 'reverted_by_stock_movement_id', table: stock_movements, label: 'stock movement' },
      ],
    });
  }
}
