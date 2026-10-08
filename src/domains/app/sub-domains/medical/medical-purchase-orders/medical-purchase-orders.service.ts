import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
import { cancelMedicalPurchaseOrderQueryDto } from './medical-purchase-orders.dto.js';
import type { MedicalPurchaseOrdersRepository } from './medical-purchase-orders.repository.js';
import { createMedicalPurchaseOrdersRules } from './medical-purchase-orders.rules.js';
import { serializeMedicalPurchaseOrder } from './medical-purchase-orders.serializer.js';
import type { MedicalPurchaseOrderOutput } from './medical-purchase-orders.types.js';
import {
  validateCreateMedicalPurchaseOrder,
  validateListMedicalPurchaseOrdersQuery,
  validateUpdateMedicalPurchaseOrder,
} from './medical-purchase-orders.validator.js';

/**
 * What the medical store orders from its suppliers (launch ROUTE #153, routes-final 11.E): the
 * Purchases tab and its CSV, create, read, change and cancel while ordered, undo the cancel, and
 * receive the goods.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.medical_purchase_orders` — the
 *   organization's, no branch (MD3); the cancel is the soft delete with its own reasons (MD15).
 *   The rules write the lines and receive them into batches (MD16); paying is a supplier-bill
 *   payment (MD7). Reading needs `medicine:read`, creating `medicine:create`, changing and
 *   receiving `medicine:update`, cancelling and undoing it `medicine:delete`, the CSV
 *   `medicine:export` (the routes' gates, MD2).
 * - **Failure modes:** `NotFoundError('Medical purchase order')`; `ValidationError` for a bad body
 *   or query, or a supplier or medicine that is no live record here; `ConflictError` per the
 *   rules, a stale save, or a restore of a live one.
 */
export class MedicalPurchaseOrdersService extends BaseRecordService<MedicalPurchaseOrderOutput> {
  constructor(
    organizationService: OrganizationService,
    repository: MedicalPurchaseOrdersRepository,
  ) {
    super(organizationService, {
      label: 'Medical purchase order',
      repository,
      deleteQuery: cancelMedicalPurchaseOrderQueryDto,
      parseCreate: validateCreateMedicalPurchaseOrder,
      parseUpdate: validateUpdateMedicalPurchaseOrder,
      parseList: validateListMedicalPurchaseOrdersQuery,
      serialize: serializeMedicalPurchaseOrder,
      references: [{ field: 'supplier_id', table: suppliers, label: 'supplier' }],
      ...createMedicalPurchaseOrdersRules(repository),
    });
  }
}
