import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { ValidationError } from '@/shared/errors/index.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { offering_groups } from '@/domains/app/sub-domains/offering-groups/offering-groups.schema.js';
import { branch_rooms } from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.schema.js';
import { OFFERING_BRANCHES_LINK, type OfferingsRepository } from './offerings.repository.js';
import { serializeOffering } from './offerings.serializer.js';
import type { OfferingOutput } from './offerings.types.js';
import { offeringsRules } from './offerings.rules.js';
import {
  validateCreateOffering,
  validateListOfferingsQuery,
  validateUpdateOffering,
} from './offerings.validator.js';

/**
 * Offerings of the active organization (launch ROUTE #11): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Offering')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class OfferingsService extends BaseRecordService<OfferingOutput> {
  constructor(organizationService: OrganizationService, repository: OfferingsRepository) {
    super(organizationService, {
      label: 'Offering',
      repository,
      parseCreate: validateCreateOffering,
      parseUpdate: validateUpdateOffering,
      parseList: validateListOfferingsQuery,
      serialize: serializeOffering,
      references: [
        { field: 'default_doctor_membership_id', table: memberships, label: 'team member' },
        { field: 'default_room_id', table: branch_rooms, label: 'room' },
        { field: 'group_id', table: offering_groups, label: 'offering group' },
      ],
      referenceLists: [{ field: 'branch_ids', link: OFFERING_BRANCHES_LINK, label: 'branch' }],
      conflicts: {
        idx_offerings_organization_name_unique: 'errors:recordAlreadyExists',
      },
      checkValues: (values) => {
        if (
          values.min_price !== undefined &&
          values.price !== undefined &&
          Number(values.min_price) > Number(values.price)
        ) {
          throw new ValidationError(
            'errors:validation.recordFieldRule',
            { field: 'min_price' },
            {
              min_price: ['The lowest price cannot be above the price'],
            },
          );
        }
      },
      ...offeringsRules,
    });
  }
}
