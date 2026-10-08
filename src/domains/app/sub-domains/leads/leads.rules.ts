import { findMembershipIdOfUser } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type {
  BaseRecordActionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { ContactMembersRepository } from '@/domains/app/sub-domains/contacts/contact-members/contact-members.repository.js';
import { ConflictError, ForbiddenError } from '@/shared/errors/index.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import { LEAD_OPEN_STATUS_VALUES, LEAD_STATUS } from './leads.constants.js';
import type { LeadsRepository } from './leads.repository.js';
import type { LeadContactSummary } from './leads.types.js';

/** A day in milliseconds (the lead hold is counted in days). */
const DAY_MILLISECONDS = 86_400_000;

/** Whether a status is an open one (L6). */
function isOpen(status: unknown): boolean {
  return (LEAD_OPEN_STATUS_VALUES as readonly unknown[]).includes(status);
}

/** A received entry newer than the team's last sent one — the contact's "awaiting reply" (M3). */
function isAwaitingReply(contact: LeadContactSummary): boolean {
  const received = contact.last_received_at;
  const sent = contact.last_sent_at;
  return received !== null && (sent === null || received > sent);
}

/** The caller's membership in the organization — 403 for a caller who is not a member. */
async function requireMembership(organizationId: number, userId: number | null): Promise<number> {
  const membershipId = await findMembershipIdOfUser({ organizationId, userId });
  if (membershipId === null) {
    throw new ForbiddenError('errors:forbidden').withReason('not_a_member');
  }
  return membershipId;
}

/** The 409 of a closed lead, with the message for the case (L8, L9). */
function leadClosedError(messageKey: string): ConflictError {
  return new ConflictError(messageKey).withReason('lead_closed');
}

/** When a hold that starts now ends — the organization's `lead_hold_days` from now (D40). */
async function holdEnd(context: BaseRecordWriteContext): Promise<Date> {
  const { lead_hold_days: holdDays } = await context.ports.organizationSettings(context.scope);
  return new Date(Date.now() + holdDays * DAY_MILLISECONDS);
}

/**
 * `claim` (D40, L9): the caller — a member — owns an open lead and holds it for `lead_hold_days`;
 * claiming again extends the hold; another member's running hold is a 409 `lead_held`.
 */
async function claimLead({
  existing,
  context,
  repository: records,
}: BaseRecordActionInput): Promise<BaseRecordRow> {
  if (!isOpen(existing.status)) throw leadClosedError('errors:leadClosed');
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
  const claimed = await records.update(
    existing.id,
    { owner_membership_id: membershipId, held_until: await holdEnd(context) },
    context.userId,
  );
  return claimed ?? existing;
}

/** `release` (D40): its owner gives an open lead back to the team — no owner, no hold. */
async function releaseLead({
  existing,
  context,
  repository: records,
}: BaseRecordActionInput): Promise<BaseRecordRow> {
  if (!isOpen(existing.status)) throw leadClosedError('errors:leadClosed');
  const membershipId = await requireMembership(context.organizationId, context.userId);
  if (existing.owner_membership_id !== membershipId) {
    throw new ForbiddenError('errors:leadNotYours').withReason('lead_not_yours');
  }
  const released = await records.update(
    existing.id,
    { owner_membership_id: null, held_until: null },
    context.userId,
  );
  return released ?? existing;
}

/**
 * Adds what a lead reads of others to a page (L1, M3, L8): the contact summary, the contact's last
 * activity and reply state, and the patient file — one read each.
 */
async function decorateLeads(
  repository: LeadsRepository,
  outputs: Record<string, unknown>[],
): Promise<void> {
  const contacts = new Map(
    (
      await repository.findContactSummaries([
        ...new Set(outputs.map((output) => String(output.contact_id))),
      ])
    ).map((contact) => [contact.id, contact]),
  );
  const patients = await repository.findPatientPublicIds(
    outputs.map((output) => String(output.id)),
  );
  for (const output of outputs) {
    const contact = contacts.get(String(output.contact_id));
    if (contact) {
      const {
        last_activity_at,
        last_sent_at: _sent,
        last_received_at: _received,
        ...summary
      } = contact;
      output.contact = summary;
      output.last_activity_at = toInstant(last_activity_at);
      output.is_awaiting_reply = isAwaitingReply(contact);
    }
    output.patient_id = patients.get(String(output.id)) ?? null;
  }
}

/**
 * The leads rules (launch ROUTE #131, routes-final 5): one open lead per contact, the
 * `clinic_visited` end state, the owner's hold, claim and release, and what a lead reads of its
 * contact.
 *
 * @remarks
 * - **Algorithm:** a create, a reopening `PATCH` and a restore check the contact has no other open
 *   lead (L6 — the partial unique index backs it up), naming the one it has. `clinic_visited` is
 *   check-in's (L8): neither a create nor a `PATCH` sets it, and a lead in it keeps it. A new owner
 *   — on create, `PATCH` or claim — starts a hold of `lead_hold_days`; no owner, no hold. The owner
 *   a `PATCH` or claim replaces stays involved (L9); the owner is never also involved. After every
 *   write the owner and involved members handle the contact (CT11). `claim` (a member; an open
 *   lead nobody else holds) and `release` (its owner; an open lead) — D40, L9. `decorate` adds the
 *   contact summary, the contact's activity fields and the patient file — one read each per page.
 * - **Failure modes:** `ConflictError` `lead_open_exists`, `lead_closed`, `lead_held`,
 *   `record_restore_conflict` (the contact was removed); `ForbiddenError` `not_a_member`,
 *   `lead_not_yours`.
 */
export function createLeadsRules(repository: LeadsRepository): BaseRecordRules {
  const contactsRepository = new ContactsRepository();
  const contactMembersRepository = new ContactMembersRepository();

  /** Refuses a second open lead for the contact, naming the one it has (L6). */
  const assertNoOtherOpenLead = async (contactId: number, exceptLeadId?: number) => {
    const open = await repository.findOpenLeadOfContact({ contactId, exceptLeadId });
    if (!open) return;
    const contact = await contactsRepository.findById(contactId);
    throw new ConflictError('errors:leadOpenExists', {
      name: [contact?.first_name, contact?.last_name].filter(Boolean).join(' '),
      lead_number: open.lead_number,
      lead_id: open.public_id,
    }).withReason('lead_open_exists');
  };

  /** The owner is not also involved, the owner it replaced stays involved, both handle the contact. */
  const settleTeam = async (
    row: BaseRecordRow,
    before: BaseRecordRow | undefined,
    context: BaseRecordWriteContext,
  ): Promise<void> => {
    const owner = row.owner_membership_id as number | null;
    const previous = (before?.owner_membership_id as number | null | undefined) ?? null;
    if (previous !== null && previous !== owner) {
      await repository.addInvolvedMemberships({
        organizationId: context.organizationId,
        leadId: row.id,
        membershipIds: [previous],
        userId: context.userId,
      });
    }
    if (owner !== null) {
      await repository.removeInvolvedMembership({ leadId: row.id, membershipId: owner });
    }
    const involved = await repository.listInvolvedMembershipIds(row.id);
    await contactMembersRepository.addForContact({
      organizationId: context.organizationId,
      contactId: row.contact_id as number,
      membershipIds: owner === null ? involved : [owner, ...involved],
      userId: context.userId,
    });
  };

  return {
    prepareCreate: async (values, context) => {
      if (values.status === LEAD_STATUS.CLINIC_VISITED) {
        throw leadClosedError('errors:leadVisitedByCheckInOnly');
      }
      if (isOpen(values.status ?? LEAD_STATUS.NEW)) {
        await assertNoOtherOpenLead(values.contact_id as number);
      }
      if (typeof values.owner_membership_id === 'number')
        values.held_until = await holdEnd(context);
    },
    prepareUpdate: async (values, existing, context) => {
      const status = values.status;
      if (status !== undefined && status !== existing.status) {
        if (existing.status === LEAD_STATUS.CLINIC_VISITED) {
          throw leadClosedError('errors:leadVisitedFinal');
        }
        if (status === LEAD_STATUS.CLINIC_VISITED) {
          throw leadClosedError('errors:leadVisitedByCheckInOnly');
        }
        if (isOpen(status) && !isOpen(existing.status)) {
          await assertNoOtherOpenLead(existing.contact_id as number, existing.id);
        }
      }
      if (
        'owner_membership_id' in values &&
        values.owner_membership_id !== existing.owner_membership_id
      ) {
        values.held_until = values.owner_membership_id === null ? null : await holdEnd(context);
      }
    },
    prepareRestore: async (deleted) => {
      const contact = await contactsRepository.findById(deleted.contact_id as number);
      if (!contact) {
        throw new ConflictError('errors:leadContactRemoved').withReason('record_restore_conflict');
      }
      if (isOpen(deleted.status))
        await assertNoOtherOpenLead(deleted.contact_id as number, deleted.id);
    },
    afterWrite: async (row, change, context) => {
      if (change.kind === 'delete') return;
      await settleTeam(row, change.before, context);
    },
    decorate: (outputs) => decorateLeads(repository, outputs),
    actions: { claim: claimLead, release: releaseLead },
  };
}
