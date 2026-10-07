import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { ManufacturersRepository } from './manufacturers.repository.js';
import { serializeManufacturer } from './manufacturers.serializer.js';
import type { ManufacturerOutput } from './manufacturers.types.js';
import {
  validateCreateManufacturer,
  validateListManufacturersQuery,
  validateUpdateManufacturer,
} from './manufacturers.validator.js';

/**
 * Manufacturers of the active organization (launch ROUTE #44): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Manufacturer')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class ManufacturersService extends BaseRecordService<ManufacturerOutput> {
  constructor(organizationService: OrganizationService, repository: ManufacturersRepository) {
    super(organizationService, {
      label: 'Manufacturer',
      repository,
      parseCreate: validateCreateManufacturer,
      parseUpdate: validateUpdateManufacturer,
      parseList: validateListManufacturersQuery,
      serialize: serializeManufacturer,
      conflicts: {
        idx_manufacturers_organization_name_unique: 'errors:recordAlreadyExists',
      },
    });
  }
}
