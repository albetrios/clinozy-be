import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { OfferingsRepository } from '@/domains/app/sub-domains/offerings/offerings.repository.js';
import { ConflictError } from '@/shared/errors/index.js';

/** The 409 for deleting a group that still holds live offerings (O7). */
const GROUP_HAS_OFFERINGS_KEY = 'errors:offeringGroupHasOfferings';

const offeringsRepository = new OfferingsRepository();

/**
 * The offering-group rules (launch ROUTE #128, routes-final 3.A): a group that still holds live
 * offerings cannot be deleted — move or ungroup them first (O7), like a role with members.
 *
 * @remarks
 * - **Algorithm:** before the soft delete, one grouped count of the organization's live offerings
 *   whose `offering_group_id` is the group.
 * - **Failure modes:** `ConflictError` (409) while the count is above zero.
 * - **Notes:** a deleted offering keeps pointing at its group (restorable either way).
 */
export const offeringGroupsRules: BaseRecordRules = {
  prepareRemove: async (existing, context) => {
    const counts = await offeringsRepository.aggregatePerGroup({
      organizationId: context.organizationId,
      groupColumn: 'offering_group_id',
      groupIds: [existing.id],
      valueColumn: 'id',
      aggregate: 'count',
    });
    if (Number(counts.get(existing.id) ?? 0) > 0) {
      throw new ConflictError(GROUP_HAS_OFFERINGS_KEY);
    }
  },
};
