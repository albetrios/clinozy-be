import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { SUPPLIER_MANUFACTURERS_LINK, type SuppliersRepository } from './suppliers.repository.js';
import { serializeSupplier } from './suppliers.serializer.js';
import type { SupplierOutput } from './suppliers.types.js';
import {
  validateCreateSupplier,
  validateListSuppliersQuery,
  validateUpdateSupplier,
} from './suppliers.validator.js';

/**
 * Suppliers of the active organization (launch ROUTE #45): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Supplier')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
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
    });
  }
}
