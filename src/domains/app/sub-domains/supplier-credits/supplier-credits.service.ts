import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { medicines } from '@/domains/app/sub-domains/medicines/medicines.schema.js';
import { suppliers } from '@/domains/app/sub-domains/suppliers/suppliers.schema.js';
import type { SupplierCreditsRepository } from './supplier-credits.repository.js';
import { serializeSupplierCredit } from './supplier-credits.serializer.js';
import type { SupplierCreditOutput } from './supplier-credits.types.js';
import {
  validateCreateSupplierCredit,
  validateListSupplierCreditsQuery,
  validateUpdateSupplierCredit,
} from './supplier-credits.validator.js';

/**
 * Supplier credits of the active organization (launch ROUTE #52): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Supplier credit')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class SupplierCreditsService extends BaseRecordService<SupplierCreditOutput> {
  constructor(organizationService: OrganizationService, repository: SupplierCreditsRepository) {
    super(organizationService, {
      label: 'Supplier credit',
      repository,
      parseCreate: validateCreateSupplierCredit,
      parseUpdate: validateUpdateSupplierCredit,
      parseList: validateListSupplierCreditsQuery,
      serialize: serializeSupplierCredit,
      references: [
        { field: 'supplier_id', table: suppliers, label: 'supplier' },
        { field: 'medicine_id', table: medicines, label: 'medicine' },
      ],
    });
  }
}
