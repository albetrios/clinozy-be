import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import { manufacturers } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.schema.js';
import type { MedicinesRepository } from './medicines.repository.js';
import { createMedicinesRules } from './medicines.rules.js';
import { serializeMedicine } from './medicines.serializer.js';
import type { MedicineOutput } from './medicines.types.js';
import {
  validateCreateMedicine,
  validateListMedicinesQuery,
  validateUpdateMedicine,
} from './medicines.validator.js';

/**
 * The medicines the store sells (launch ROUTE #153, routes-final 11.D): the tab, the pickers and
 * the CSV, add with batches and supplier prices, read, change, delete at zero stock, restore, and
 * the near-expiry discount.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.medicines` — the organization's,
 *   no branch (MD3); the rules keep the batches, prices and stock (MD4, MD13). A create or change
 *   answers with the medicine as its batches left it (a fresh read). Reading needs `medicine:read`,
 *   adding `medicine:create`, changing and the discount `medicine:update`, deleting and restoring
 *   `medicine:delete`, the CSV `medicine:export` (the routes' gates, MD2).
 * - **Failure modes:** `NotFoundError('Medicine')`; `ValidationError` for a bad body or query, or a
 *   manufacturer or supplier that is no live record here; `ConflictError` for a taken name or
 *   batch number, a stale save, stock on delete, or a restore of a live one or over a reused name.
 */
export class MedicinesService extends BaseRecordService<MedicineOutput> {
  constructor(organizationService: OrganizationService, repository: MedicinesRepository) {
    super(organizationService, {
      label: 'Medicine',
      repository,
      parseCreate: validateCreateMedicine,
      parseUpdate: validateUpdateMedicine,
      parseList: validateListMedicinesQuery,
      serialize: serializeMedicine,
      references: [{ field: 'manufacturer_id', table: manufacturers, label: 'manufacturer' }],
      conflicts: {
        idx_medicines_organization_name_unique: {
          key: 'errors:recordAlreadyExists',
          reason: 'record_already_exists',
        },
      },
      ...createMedicinesRules(repository),
    });
  }

  /** Adds — and answers with the medicine as its batches left it (MD4). */
  override async create(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
    parentPublicId?: string,
    visibility?: BaseRecordVisibility,
    createName?: string,
  ): Promise<MedicineOutput> {
    const created = await super.create(
      scope,
      body,
      actingUserPublicId,
      parentPublicId,
      visibility,
      createName,
    );
    return this.get(scope, created.id, actingUserPublicId, visibility);
  }

  /** Changes — and answers with the medicine as its batches left it (MD4). */
  override async update(
    scope: OrganizationPrincipalDatabaseScope,
    publicId: string,
    body: unknown,
    actingUserPublicId: string | undefined,
    visibility?: BaseRecordVisibility,
    parentPublicId?: string,
  ): Promise<MedicineOutput> {
    await super.update(scope, publicId, body, actingUserPublicId, visibility, parentPublicId);
    return this.get(scope, publicId, actingUserPublicId, visibility);
  }
}
