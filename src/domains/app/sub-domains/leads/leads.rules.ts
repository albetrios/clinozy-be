import { findMembershipIdOfUser, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { LeadReadsRepository } from '@/domains/app/sub-domains/lead-reads/lead-reads.repository.js';
import { MessagesRepository } from '@/domains/app/sub-domains/messages/messages.repository.js';
import { PatientsRepository } from '@/domains/app/sub-domains/patients/patients.repository.js';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors/index.js';
import { leads } from './leads.schema.js';

/** A day in milliseconds (the lead hold is counted in days). */
const DAY_MILLISECONDS = 86_400_000;
/** The most read markers one decorate reads (a list page is at most 100 leads). */
const READ_MARKERS_PER_PAGE = 100;

const leadReadsRepository = new LeadReadsRepository();
const patientsRepository = new PatientsRepository();
const messagesRepository = new MessagesRepository();

/** The patient's branch: the body's, else the lead's — 400 when neither names a branch here. */
async function conversionBranch(
  requested: unknown,
  leadBranchId: unknown,
  organizationId: number,
): Promise<number> {
  if (typeof requested === 'string') {
    const ids = await resolveRecordIds({ table: branches, organizationId, publicIds: [requested] });
    const id = ids.get(requested);
    if (id !== undefined) return id;
  } else if (typeof leadBranchId === 'number') {
    return leadBranchId;
  }
  throw new ValidationError(
    'errors:validation.recordFieldRule',
    { field: 'home_branch_id' },
    { home_branch_id: ['Name the branch the patient belongs to'] },
  );
}

/** The caller's membership in the organization — 403 for a caller who is not a member. */
async function requireMembership(organizationId: number, userId: number | null): Promise<number> {
  const membershipId = await findMembershipIdOfUser({ organizationId, userId });
  if (membershipId === null) {
    throw new ForbiddenError('errors:forbidden').withReason('not_a_member');
  }
  return membershipId;
}

/**
 * The leads rules (launch ROUTE #64): claim and release the hold (D40), the per-viewer read
 * marker and `is_unread` (D3).
 *
 * @remarks
 * - **Algorithm:** `claim` makes the caller the owner and holds the lead for the organization's
 *   `lead_hold_days`; a lead another member still holds is a 409. `release` (the owner only)
 *   clears owner and hold. `reads` upserts the caller's `app.lead_reads` row. `is_unread` is
 *   "the last touch is newer than the caller's last read".
 * - **Failure modes:** `ConflictError('lead_held')`; `ForbiddenError('lead_not_yours')`.
 */
export const leadsRules: BaseRecordRules = {
  decorate: async (outputs, context) => {
    if (context.userId === null) return;
    const ids = await resolveRecordIds({
      table: leads,
      organizationId: context.organizationId,
      publicIds: outputs.map((output) => String(output.id)),
    });
    const page = await leadReadsRepository.list(context.organizationId, {
      limit: READ_MARKERS_PER_PAGE,
      equals: { lead_id: [...ids.values()], created_by_user_id: context.userId },
      withTotal: false,
    });
    const readAt = new Map(page.items.map((read) => [read.lead_id, read.last_read_at as Date]));
    for (const output of outputs) {
      const touched = output.last_touch_at ? new Date(String(output.last_touch_at)) : null;
      const read = readAt.get(ids.get(String(output.id)));
      output.is_unread = touched !== null && (read === undefined || read < touched);
    }
  },
  actions: {
    claim: async ({ existing, context, repository }) => {
      const membershipId = await requireMembership(context.organizationId, context.userId);
      const heldUntil = existing.held_until as Date | null;
      const heldByOther =
        existing.owner_membership_id !== null &&
        existing.owner_membership_id !== membershipId &&
        heldUntil !== null &&
        heldUntil > new Date();
      if (heldByOther) {
        throw new ConflictError('errors:leadHeld', {
          held_until: heldUntil.toISOString(),
        }).withReason('lead_held');
      }
      const { lead_hold_days: holdDays } = await context.ports.organizationSettings(context.scope);
      const claimed = await repository.update(
        existing.id,
        {
          owner_membership_id: membershipId,
          held_until: new Date(Date.now() + holdDays * DAY_MILLISECONDS),
        },
        context.userId,
      );
      return claimed ?? existing;
    },
    release: async ({ existing, context, repository }) => {
      const membershipId = await requireMembership(context.organizationId, context.userId);
      if (existing.owner_membership_id !== membershipId) {
        throw new ForbiddenError('errors:leadNotYours').withReason('lead_not_yours');
      }
      const released = await repository.update(
        existing.id,
        { owner_membership_id: null, held_until: null },
        context.userId,
      );
      return released ?? existing;
    },
    convert: async ({ existing, input, context, repository }) => {
      if (existing.patient_id !== null) {
        throw new ConflictError('errors:leadConverted').withReason('lead_converted');
      }
      const [firstWord, ...rest] = String(existing.name).trim().split(/\s+/);
      const patient = await patientsRepository.insert({
        organization_id: context.organizationId,
        first_name: input.first_name ?? firstWord,
        last_name: input.last_name ?? (rest.length > 0 ? rest.join(' ') : null),
        phone: existing.phone,
        phones: existing.phones ?? [],
        email: existing.email,
        gender: input.gender ?? null,
        date_of_birth: input.date_of_birth ?? null,
        home_branch_id: await conversionBranch(
          input.home_branch_id,
          existing.branch_id,
          context.organizationId,
        ),
        lead_id: existing.id,
        conversion: 'converted',
        instagram_handles: existing.instagram_handles ?? [],
        default_channel: existing.default_channel,
        household: existing.household,
        created_by_user_id: context.userId,
        updated_by_user_id: context.userId,
      });
      // The conversation continues with the patient: every line moves over (one contact per line).
      await messagesRepository.updateMany({
        organizationId: context.organizationId,
        equals: { lead_id: existing.id },
        values: { lead_id: null, patient_id: patient.id },
        userId: context.userId,
      });
      const converted = await repository.update(
        existing.id,
        { patient_id: patient.id },
        context.userId,
      );
      return converted ?? existing;
    },
    reads: async ({ existing, context }) => {
      const page = await leadReadsRepository.list(context.organizationId, {
        limit: 1,
        equals: { lead_id: existing.id, created_by_user_id: context.userId },
        withTotal: false,
      });
      const marker = page.items[0];
      if (marker) {
        await leadReadsRepository.update(marker.id, { last_read_at: new Date() }, context.userId);
      } else {
        await leadReadsRepository.insert({
          organization_id: context.organizationId,
          lead_id: existing.id,
          last_read_at: new Date(),
          created_by_user_id: context.userId,
          updated_by_user_id: context.userId,
        });
      }
      return existing;
    },
  },
};
