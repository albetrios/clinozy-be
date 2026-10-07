import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { OfferingGroupsRepository } from './offering-groups.repository.js';
import { serializeOfferingGroup } from './offering-groups.serializer.js';
import type { OfferingGroupOutput } from './offering-groups.types.js';
import {
  validateCreateOfferingGroup,
  validateListOfferingGroupsQuery,
  validateUpdateOfferingGroup,
} from './offering-groups.validator.js';

/**
 * Offering groups of the active organization (launch ROUTE #10): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Offering group')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class OfferingGroupsService extends BaseRecordService<OfferingGroupOutput> {
  constructor(organizationService: OrganizationService, repository: OfferingGroupsRepository) {
    super(organizationService, {
      label: 'Offering group',
      repository,
      parseCreate: validateCreateOfferingGroup,
      parseUpdate: validateUpdateOfferingGroup,
      parseList: validateListOfferingGroupsQuery,
      serialize: serializeOfferingGroup,
      conflicts: {
        idx_offering_groups_organization_name_unique: 'errors:recordAlreadyExists',
      },
    });
  }
}
