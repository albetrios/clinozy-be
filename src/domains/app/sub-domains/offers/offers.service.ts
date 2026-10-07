import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { ValidationError } from '@/shared/errors/index.js';
import {
  OFFER_OFFERINGS_LINK,
  OFFER_BRANCHES_LINK,
  type OffersRepository,
} from './offers.repository.js';
import { serializeOffer } from './offers.serializer.js';
import type { OfferOutput } from './offers.types.js';
import {
  validateCreateOffer,
  validateListOffersQuery,
  validateUpdateOffer,
} from './offers.validator.js';

/**
 * Offers of the active organization (launch ROUTE #12): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Offer')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
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
        { field: 'offering_ids', link: OFFER_OFFERINGS_LINK, label: 'offering' },
        { field: 'branch_ids', link: OFFER_BRANCHES_LINK, label: 'branch' },
      ],
      checkValues: (values) => {
        if (
          values.ends_on != null &&
          values.starts_on != null &&
          String(values.ends_on) < String(values.starts_on)
        ) {
          throw new ValidationError(
            'errors:validation.recordFieldRule',
            { field: 'ends_on' },
            {
              ends_on: ['The offer must end on or after its start'],
            },
          );
        }
      },
    });
  }
}
