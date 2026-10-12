import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { SUPPLIER_MANUFACTURERS_LINK, type SuppliersRepository } from './suppliers.repository.js';
import { createSuppliersRules } from './suppliers.rules.js';
import { serializeSupplier } from './suppliers.serializer.js';
import type { SupplierOutput } from './suppliers.types.js';
import {
  validateCreateSupplier,
  validateListSuppliersQuery,
  validateUpdateSupplier,
} from './suppliers.validator.js';

/**
 * The agencies the medical store buys from (launch ROUTE #153, routes-final 11.B): the tab and
 * picker, add, read with what is owed, change, delete with nothing owed, restore, and pay what is
 * due.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.suppliers` — the organization's,
 *   no branch (MD3); `manufacturer_ids` replaces the link rows the manufacturer's `supplier_ids`
 *   writes too. Never the clinic stock's vendors (S13). Reading needs `medicine:read`, adding
 *   `medicine:create`, changing `medicine:update`, deleting and restoring `medicine:delete`,
 *   paying `payment:create` (the routes' gates, MD2).
 * - **Failure modes:** `NotFoundError('Supplier')`; `ValidationError` for a bad body or query, or a
 *   manufacturer that is no live record here; `ConflictError` for a taken name, a stale save, dues
 *   on delete, a payment over the payable or on a closed day, or a restore of a live one or over a
 *   reused name.
 */
export class SuppliersService extends BaseRecordService<SupplierOutput> {
  constructor(organizationService: OrganizationService, repository: SuppliersRepository) {
    super(organizationService, {
      label: 'Supplier',
      repository,
      parseCreate: validateCreateSupplier,
      parseUpdate: validateUpdateSupplier,
      parseList: validateListSuppliersQuery,
      serialize: serializeSupplier,
      referenceLists: [
        { field: 'manufacturer_ids', link: SUPPLIER_MANUFACTURERS_LINK, label: 'manufacturer' },
      ],
      conflicts: {
        idx_suppliers_organization_name_unique: {
          key: 'errors:recordAlreadyExists',
          reason: 'record_already_exists',
        },
      },
      ...createSuppliersRules(repository),
    });
  }
}
