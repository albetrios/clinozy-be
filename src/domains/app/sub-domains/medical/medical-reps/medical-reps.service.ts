import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import {
  MEDICAL_REP_MANUFACTURERS_LINK,
  type MedicalRepsRepository,
} from './medical-reps.repository.js';
import { createMedicalRepsRules } from './medical-reps.rules.js';
import { serializeMedicalRep } from './medical-reps.serializer.js';
import type { MedicalRepOutput } from './medical-reps.types.js';
import {
  validateCreateMedicalRep,
  validateListMedicalRepsQuery,
  validateUpdateMedicalRep,
} from './medical-reps.validator.js';

/**
 * The medical representatives who visit the store (launch ROUTE #153, routes-final 11.F): the tab
 * and picker, add, read, change, delete, restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.medical_reps` — the organization's,
 *   no branch (MD3); `manufacturer_ids` replaces the link rows the manufacturer's `medical_rep_ids`
 *   writes too. Names are not unique. Reading needs `medicine:read`, adding `medicine:create`,
 *   changing `medicine:update`, deleting and restoring `medicine:delete` (the routes' gates, MD2).
 * - **Failure modes:** `NotFoundError('Medical rep')`; `ValidationError` for a bad body or query,
 *   a next visit outside the window, or a manufacturer that is no live record here;
 *   `ConflictError` for a stale save or a restore of a live one.
 */
export class MedicalRepsService extends BaseRecordService<MedicalRepOutput> {
  constructor(organizationService: OrganizationService, repository: MedicalRepsRepository) {
    super(organizationService, {
      label: 'Medical rep',
      repository,
      parseCreate: validateCreateMedicalRep,
      parseUpdate: validateUpdateMedicalRep,
      parseList: validateListMedicalRepsQuery,
      serialize: serializeMedicalRep,
      referenceLists: [
        { field: 'manufacturer_ids', link: MEDICAL_REP_MANUFACTURERS_LINK, label: 'manufacturer' },
      ],
      ...createMedicalRepsRules(repository),
    });
  }
}
