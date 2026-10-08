import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import {
  OFFER_OFFERINGS_LINK,
  OFFER_BRANCHES_LINK,
  type OffersRepository,
} from './offers.repository.js';
import { serializeOffer } from './offers.serializer.js';
import type { OfferOutput } from './offers.types.js';
import { assertOfferValues, offersRules } from './offers.rules.js';
import {
  validateCreateOffer,
  validateListOffersQuery,
  validateUpdateOffer,
} from './offers.validator.js';

/**
 * Offers of the active organization (launch ROUTE #12, rebuilt at #128 — routes-final 3.C): list
 * by derived status, read, create, update (pause and resume too), soft-delete with a reason and
 * restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, reference lists,
 *   rules and serializer; every call runs in the caller's organization context. `offering_ids`
 *   must name live, active offerings (O12); `branch_ids` none = every branch (O5).
 * - **Failure modes:** `NotFoundError('Offer')`; `ValidationError` for a bad body, a value out of
 *   its kind's range, an end before the start (O11), an offering that is deleted, inactive or not
 *   here (O12) or a branch not here; `ConflictError` for a code another live offer has (O11), a
 *   stale save or a restore over a reused code.
 */
export class OffersService extends BaseRecordService<OfferOutput> {
  constructor(organizationService: OrganizationService, repository: OffersRepository) {
    super(organizationService, {
      label: 'Offer',
      repository,
      parseCreate: validateCreateOffer,
      parseUpdate: validateUpdateOffer,
      parseList: validateListOffersQuery,
      serialize: serializeOffer,
      referenceLists: [
        {
          field: 'offering_ids',
          link: OFFER_OFFERINGS_LINK,
          label: 'offering',
          require: { is_active: true },
          notFoundKey: 'errors:validation.offeringNotActive',
        },
        { field: 'branch_ids', link: OFFER_BRANCHES_LINK, label: 'branch', emptyMeansEvery: true },
      ],
      conflicts: {
        idx_offers_organization_code_unique: 'errors:offerCodeInUse',
      },
      checkValues: assertOfferValues,
      ...offersRules,
    });
  }
}
