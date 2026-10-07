import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { ValidationError } from '@/shared/errors/index.js';
import { manufacturers } from '@/domains/app/sub-domains/manufacturers/manufacturers.schema.js';
import type { MedicinesRepository } from './medicines.repository.js';
import { serializeMedicine } from './medicines.serializer.js';
import type { MedicineOutput } from './medicines.types.js';
import {
  validateCreateMedicine,
  validateListMedicinesQuery,
  validateUpdateMedicine,
} from './medicines.validator.js';

/**
 * Medicines of the active organization (launch ROUTE #48): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Medicine')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
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
      checkValues: (values) => {
        if (
          values.min_stock !== undefined &&
          values.max_stock !== undefined &&
          Number(values.min_stock) > Number(values.max_stock)
        ) {
          throw new ValidationError(
            'errors:validation.recordFieldRule',
            { field: 'min_stock' },
            {
              min_stock: ['The minimum stock cannot be above the maximum'],
            },
          );
        }
      },
    });
  }
}
