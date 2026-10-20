import { describe, expect, it, vi } from 'vitest';
import type { BaseRecordActionInput } from '@/domains/app/base-record.types.js';
import { LEAD_OPEN_STATUS_VALUES } from '@/domains/app/sub-domains/leads/leads.constants.js';
import type { LeadsRepository } from '@/domains/app/sub-domains/leads/leads.repository.js';
import { createLeadsRules } from '@/domains/app/sub-domains/leads/leads.rules.js';
import { ConflictError } from '@/shared/errors/index.js';

const CALLER_MEMBERSHIP_ID = 7;
const OTHER_MEMBERSHIP_ID = 9;

vi.mock('@/domains/app/base-record.repository.js', () => ({
  findMembershipIdOfUser: vi.fn(async () => CALLER_MEMBERSHIP_ID),
}));
vi.mock('@/domains/app/sub-domains/contacts/contacts.repository.js', () => ({
  ContactsRepository: class {},
}));
vi.mock('@/domains/app/sub-domains/contacts/contact-members/contact-members.repository.js', () => ({
  ContactMembersRepository: class {},
}));

/** A claim of an open lead that another member owns, with its hold ending at `heldUntil`. */
function claimOfLeadHeldUntil(heldUntil: Date) {
  const claimed = {
    id: 1,
    status: LEAD_OPEN_STATUS_VALUES[0],
    owner_membership_id: CALLER_MEMBERSHIP_ID,
  };
  const repository = { claim: vi.fn(async () => claimed) };
  const claim = createLeadsRules(repository as unknown as LeadsRepository).actions?.claim;
  if (!claim) throw new Error('the leads rules have no claim action');
  const input = {
    existing: {
      id: 1,
      status: LEAD_OPEN_STATUS_VALUES[0],
      owner_membership_id: OTHER_MEMBERSHIP_ID,
      held_until: heldUntil,
    },
    context: {
      organizationId: 3,
      userId: 5,
      scope: {},
      ports: { organizationSettings: async () => ({ lead_hold_days: 3 }) },
    },
  } as unknown as BaseRecordActionInput;
  return { run: () => claim(input), repository };
}

/**
 * Locks in the hold check of a lead claim (D40, L9): another member's running hold refuses the
 * claim with a 409 `lead_held` before any write; an expired hold lets it through. Only DB-bound
 * tests asserted it before, so pre-push never saw a flipped comparison (planted-bug drill A2-3,
 * 20 Oct 2026).
 */
describe('leads claim — a hold another member owns', () => {
  it('refuses the claim while that hold runs, without writing', async () => {
    const { run, repository } = claimOfLeadHeldUntil(new Date(Date.now() + 60 * 60 * 1000));
    await expect(run()).rejects.toBeInstanceOf(ConflictError);
    await expect(run()).rejects.toMatchObject({ reason: 'lead_held' });
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it('lets the claim through once that hold has ended', async () => {
    const { run, repository } = claimOfLeadHeldUntil(new Date(Date.now() - 60 * 60 * 1000));
    await expect(run()).resolves.toMatchObject({ owner_membership_id: CALLER_MEMBERSHIP_ID });
    expect(repository.claim).toHaveBeenCalledOnce();
  });
});
