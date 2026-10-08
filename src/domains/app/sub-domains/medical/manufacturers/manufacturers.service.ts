import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import {
  MANUFACTURER_MEDICAL_REPS_LINK,
  MANUFACTURER_SUPPLIERS_LINK,
  type ManufacturersRepository,
} from './manufacturers.repository.js';
import { createManufacturersRules } from './manufacturers.rules.js';
import { serializeManufacturer } from './manufacturers.serializer.js';
import type { ManufacturerOutput } from './manufacturers.types.js';
import {
  validateCreateManufacturer,
  validateListManufacturersQuery,
  validateUpdateManufacturer,
} from './manufacturers.validator.js';

/**
 * The brands on the medical store's packs (launch ROUTE #153, routes-final 11.A): the tab and
 * picker, add, read, change with the suppliers and MRs that carry them, delete without medicines,
 * restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.manufacturers` — the
 *   organization's, no branch (MD3); `supplier_ids` and `medical_rep_ids` replace the link rows
 *   the supplier's and the MR's `manufacturer_ids` write too (MD9). Reading needs `medicine:read`,
 *   adding `medicine:create`, changing `medicine:update`, deleting and restoring `medicine:delete`
 *   (the routes' gates, MD2).
 * - **Failure modes:** `NotFoundError('Manufacturer')`; `ValidationError` for a bad body or query,
 *   or a supplier or MR that is no live record here; `ConflictError` for a taken name, a stale
 *   save, live medicines on delete, or a restore of a live one or over a reused name.
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
      referenceLists: [
        { field: 'supplier_ids', link: MANUFACTURER_SUPPLIERS_LINK, label: 'supplier' },
        { field: 'medical_rep_ids', link: MANUFACTURER_MEDICAL_REPS_LINK, label: 'medical rep' },
      ],
      conflicts: {
        idx_manufacturers_organization_name_unique: {
          key: 'errors:recordAlreadyExists',
          reason: 'record_already_exists',
        },
      },
      ...createManufacturersRules(repository),
    });
  }
}
