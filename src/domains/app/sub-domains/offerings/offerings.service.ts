import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { offering_groups } from '@/domains/app/sub-domains/offerings/offering-groups/offering-groups.schema.js';
import { OFFERING_BRANCHES_LINK, type OfferingsRepository } from './offerings.repository.js';
import { serializeOffering } from './offerings.serializer.js';
import type { OfferingOutput } from './offerings.types.js';
import { assertOfferingPriceOrder, offeringsRules } from './offerings.rules.js';
import {
  validateCreateOffering,
  validateListOfferingsQuery,
  validateUpdateOffering,
} from './offerings.validator.js';

/**
 * Offerings of the active organization (launch ROUTE #11, rebuilt at #128 — routes-final 3.B):
 * list, export, read, create, update (prices included), soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references,
 *   rules and serializer; every call runs in the caller's organization context. `branch_ids` is
 *   the `app.offering_branches` link — none = every branch (O5); the list's `branch_id` keeps those.
 * - **Failure modes:** `NotFoundError('Offering')`; `ValidationError` for a bad body, a group or
 *   branch that is no live record here, or prices out of order (O4); `ConflictError` for a taken
 *   name (`offering_name_taken`, D81), a stale save or a restore over a reused name.
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
      references: [{ field: 'offering_group_id', table: offering_groups, label: 'offering group' }],
      referenceLists: [
        {
          field: 'branch_ids',
          link: OFFERING_BRANCHES_LINK,
          label: 'branch',
          emptyMeansEvery: true,
        },
      ],
      conflicts: {
        idx_offerings_organization_name_unique: {
          key: 'errors:offeringNameTaken',
          reason: 'offering_name_taken',
        },
      },
      checkValues: assertOfferingPriceOrder,
      ...offeringsRules,
    });
  }
}
