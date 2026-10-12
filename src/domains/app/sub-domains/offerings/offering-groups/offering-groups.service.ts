import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { OfferingGroupsRepository } from './offering-groups.repository.js';
import { serializeOfferingGroup } from './offering-groups.serializer.js';
import type { OfferingGroupOutput } from './offering-groups.types.js';
import { offeringGroupsRules } from './offering-groups.rules.js';
import {
  validateCreateOfferingGroup,
  validateListOfferingGroupsQuery,
  validateUpdateOfferingGroup,
} from './offering-groups.validator.js';

/**
 * Offering groups of the active organization (launch ROUTE #10, rebuilt at #128 — routes-final
 * 3.A): list in menu order, read, create, update, soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, serializer and
 *   rules; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Offering group')`; `ValidationError` for a bad body;
 *   `ConflictError` for a taken name, a stale save, a delete while live offerings use the group
 *   (O7) or a restore over a reused name.
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
      ...offeringGroupsRules,
    });
  }
}
