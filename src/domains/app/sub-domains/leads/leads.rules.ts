import { MILLISECONDS_PER_DAY } from '@/shared/constants/ttl.constants.js';
import { findMembershipIdOfUser } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type {
  BaseRecordActionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { contactAwaitsReply } from '@/domains/app/sub-domains/contacts/contacts.serializer.js';
import { ContactMembersRepository } from '@/domains/app/sub-domains/contacts/contact-members/contact-members.repository.js';
import { ConflictError, ForbiddenError } from '@/shared/errors/index.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import {
  LEAD_BOOKED_CLOSING_STATUS_VALUES,
  LEAD_OPEN_STATUS_VALUES,
  LEAD_STATUS,
} from './leads.constants.js';
import type { LeadsRepository } from './leads.repository.js';

const contactsRepository = new ContactsRepository();

/** Whether a status is an open one (L6). */
function isOpen(status: unknown): boolean {
  return (LEAD_OPEN_STATUS_VALUES as readonly unknown[]).includes(status);
}

/** The caller's membership in the organization — 403 for a caller who is not a member. */
async function requireMembership({
  organizationId,
  userId,
}: {
  organizationId: number;
  userId: number | null;
}): Promise<number> {
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

/** The 409 of a status the person's bookings own (L11), with the message for the case. */
function leadStatusByBookingError(messageKey: string): ConflictError {
  return new ConflictError(messageKey).withReason('lead_status_by_booking');
}

/** When a hold that starts now ends — the organization's `lead_hold_days` from now (D40). */
async function holdEnd(context: BaseRecordWriteContext): Promise<Date> {
  const { lead_hold_days: holdDays } = await context.ports.organizationSettings(context.scope);
  return new Date(Date.now() + holdDays * MILLISECONDS_PER_DAY);
}

/** The 409 of a lead another member holds, naming when the hold ends. */
function leadHeldError(heldUntil: Date): ConflictError {
  return new ConflictError('errors:leadHeld', {
    held_until: heldUntil.toISOString(),
  }).withReason('lead_held');
}

/**
 * `claim` (D40, L9): the caller — a member — owns an open lead and holds it for `lead_hold_days`;
 * claiming again extends the hold; another member's running hold is a 409 `lead_held`. The write
 * is the repository's guarded claim, so two members claiming at once cannot both win: the loser's
 * statement finds the lead held and answers the same 409.
 */
function createClaimLead(leadsRepository: LeadsRepository) {
  return async ({ existing, context }: BaseRecordActionInput): Promise<BaseRecordRow> => {
    if (!isOpen(existing.status)) throw leadClosedError('errors:leadClosed');
    const membershipId = await requireMembership({
      organizationId: context.organizationId,
      userId: context.userId,
    });
    const heldUntil = existing.held_until as Date | null;
    const heldByOther =
      existing.owner_membership_id !== null &&
      existing.owner_membership_id !== membershipId &&
      heldUntil !== null &&
      heldUntil > new Date();
    if (heldByOther) throw leadHeldError(heldUntil);
    const claimed = await leadsRepository.claim({
      leadId: existing.id,
      membershipId,
      heldUntil: await holdEnd(context),
      userId: context.userId,
    });
    if (claimed) return claimed as BaseRecordRow;
    // Refused by the guard: closed, removed or claimed by another member meanwhile
    const now = await leadsRepository.findById(existing.id);
    if (!(now && isOpen(now.status))) throw leadClosedError('errors:leadClosed');
    throw leadHeldError((now.held_until as Date | null) ?? new Date());
  };
}

/** `release` (D40): its owner gives an open lead back to the team — no owner, no hold. */
async function releaseLead({
  existing,
  context,
  repository: records,
}: BaseRecordActionInput): Promise<BaseRecordRow> {
  if (!isOpen(existing.status)) throw leadClosedError('errors:leadClosed');
  const membershipId = await requireMembership({
    organizationId: context.organizationId,
    userId: context.userId,
  });
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
 * L11: a lead with a booking still to happen leaves `appointment_scheduled` by hand only for a
 * closing status (the person said no); back to working it is the booking's — cancel it. A lead
 * whose bookings have all ended meanwhile moves freely.
 */
async function assertBookingAllowsMove({
  repository,
  status,
  existing,
}: {
  repository: LeadsRepository;
  status: unknown;
  existing: BaseRecordRow;
}): Promise<void> {
  if (existing.status !== LEAD_STATUS.APPOINTMENT_SCHEDULED) return;
  if ((LEAD_BOOKED_CLOSING_STATUS_VALUES as readonly unknown[]).includes(status)) return;
  if (await repository.hasLiveBooking(existing.contact_id as number)) {
    throw leadStatusByBookingError('errors:leadScheduledUntilBookingEnds');
  }
}

/**
 * L11: a lead created, reopened or restored while its person has a booking still to happen is
 * `appointment_scheduled` at once — the response carries the moved row.
 */
async function followBookings({
  repository,
  row,
  context,
}: {
  repository: LeadsRepository;
  row: BaseRecordRow;
  context: BaseRecordWriteContext;
}): Promise<void> {
  if (!isOpen(row.status)) return;
  const moved = await repository.followBookings({
    contactId: row.contact_id as number,
    userId: context.userId,
  });
  if (moved) Object.assign(row, moved);
}

/**
 * Adds what a lead reads of others to a page (L1, M3, L8): the contact summary, the contact's last
 * activity and reply state, and the contact's patient file — one read each.
 */
async function decorateLeads({
  outputs,
  context,
}: {
  outputs: Record<string, unknown>[];
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { organizationId } = context;
  const contactIds = [...new Set(outputs.map((output) => String(output.contact_id)))];
  const contacts = new Map(
    (await contactsRepository.findSummaries(contactIds, organizationId)).map((contact) => [
      contact.id,
      contact,
    ]),
  );
  const patientFiles = await contactsRepository.findPatientFiles(contactIds, organizationId);
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
      output.is_awaiting_reply = contactAwaitsReply(contact);
    }
    output.patient_id = patientFiles.get(String(output.contact_id))?.id ?? null;
  }
}

/**
 * The leads rules (launch ROUTE #131, routes-final 5): one open lead per contact, the bookings'
 * `appointment_scheduled`, the `clinic_visited` end state, the owner's hold, claim and release,
 * and what a lead reads of its contact.
 *
 * @remarks
 * - **Algorithm:** a create, a reopening `PATCH` and a restore check the contact has no other open
 *   lead (L6 — the partial unique index backs it up), naming the one it has. `clinic_visited` is
 *   check-in's (L8): neither a create nor a `PATCH` sets it, and a lead in it keeps it.
 *   `appointment_scheduled` is the person's bookings' (L11): neither a create nor a `PATCH` sets
 *   it; while a booking is still to happen a `PATCH` leaves it only for a closing status
 *   (`not_interested`, `invalid`, `lost`); a lead created, reopened or restored while one is
 *   booked takes it at once ({@link LeadsRepository.followBookings}). A new owner — on create,
 *   `PATCH` or claim — starts a hold of `lead_hold_days`; no owner, no hold. The owner a `PATCH`
 *   or claim replaces stays involved (L9); the owner is never also involved. After every
 *   write the owner and involved members handle the contact (CT11). `claim` (a member; an open
 *   lead nobody else holds) and `release` (its owner; an open lead) — D40, L9. `decorate` adds the
 *   contact summary, the contact's activity fields and the patient file — one read each per page.
 * - **Failure modes:** `ConflictError` `lead_open_exists`, `lead_closed`, `lead_held`,
 *   `lead_status_by_booking`, `record_restore_conflict` (the contact was removed); `ForbiddenError` `not_a_member`,
 *   `lead_not_yours`.
 */
export function createLeadsRules(repository: LeadsRepository): BaseRecordRules {
  const contactMembersRepository = new ContactMembersRepository();

  /** Refuses a second open lead for the contact, naming the one it has (L6). */
  const assertNoOtherOpenLead = async ({
    contactId,
    exceptLeadId,
  }: {
    contactId: number;
    exceptLeadId?: number | undefined;
  }) => {
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
  const settleTeam = async ({
    row,
    before,
    context,
  }: {
    row: BaseRecordRow;
    before: BaseRecordRow | undefined;
    context: BaseRecordWriteContext;
  }): Promise<void> => {
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
      if (values.status === LEAD_STATUS.APPOINTMENT_SCHEDULED) {
        throw leadStatusByBookingError('errors:leadScheduledByBookingOnly');
      }
      if (isOpen(values.status ?? LEAD_STATUS.NEW)) {
        await assertNoOtherOpenLead({ contactId: values.contact_id as number });
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
        if (status === LEAD_STATUS.APPOINTMENT_SCHEDULED) {
          throw leadStatusByBookingError('errors:leadScheduledByBookingOnly');
        }
        await assertBookingAllowsMove({ repository, status, existing });
        if (isOpen(status) && !isOpen(existing.status)) {
          await assertNoOtherOpenLead({
            contactId: existing.contact_id as number,
            exceptLeadId: existing.id,
          });
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
        await assertNoOtherOpenLead({
          contactId: deleted.contact_id as number,
          exceptLeadId: deleted.id,
        });
    },
    afterWrite: async (row, change, context) => {
      if (change.kind === 'delete') return;
      await settleTeam({ row, before: change.before, context });
      const statusSet =
        change.kind === 'create' ||
        change.kind === 'restore' ||
        row.status !== change.before?.status;
      if (statusSet) await followBookings({ repository, row, context });
    },
    decorate: (outputs, context) => decorateLeads({ outputs, context }),
    actions: { claim: createClaimLead(repository), release: releaseLead },
  };
}
