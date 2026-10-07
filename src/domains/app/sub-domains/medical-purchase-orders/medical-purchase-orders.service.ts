import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { suppliers } from '@/domains/app/sub-domains/suppliers/suppliers.schema.js';
import type { MedicalPurchaseOrdersRepository } from './medical-purchase-orders.repository.js';
import { serializeMedicalPurchaseOrder } from './medical-purchase-orders.serializer.js';
import type { MedicalPurchaseOrderOutput } from './medical-purchase-orders.types.js';
import {
  validateCancelMedicalPurchaseOrder,
  validateCreateMedicalPurchaseOrder,
  validateListMedicalPurchaseOrdersQuery,
  validateUpdateMedicalPurchaseOrder,
} from './medical-purchase-orders.validator.js';

/**
 * Purchase orders of the active organization (launch ROUTE #49): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `receive`, `cancel`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Purchase order')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class MedicalPurchaseOrdersService extends BaseRecordService<MedicalPurchaseOrderOutput> {
  constructor(
    organizationService: OrganizationService,
    repository: MedicalPurchaseOrdersRepository,
  ) {
    super(organizationService, {
      label: 'Purchase order',
      repository,
      parseCreate: validateCreateMedicalPurchaseOrder,
      parseUpdate: validateUpdateMedicalPurchaseOrder,
      parseList: validateListMedicalPurchaseOrdersQuery,
      serialize: serializeMedicalPurchaseOrder,
      references: [{ field: 'supplier_id', table: suppliers, label: 'supplier' }],
      transitions: {
        receive: {
          statusColumn: 'stage',
          from: ['ordered'],
          set: { stage: 'received' },
          stamp: ['received_at'],
        },
        cancel: {
          statusColumn: 'stage',
          from: ['ordered'],
          set: { stage: 'cancelled' },
          parse: validateCancelMedicalPurchaseOrder,
        },
      },
    });
  }
}
