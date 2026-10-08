import type { MembershipLeavePort } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import { BranchesRepository } from './sub-domains/branches/branches.repository.js';
import { ContactMembersRepository } from './sub-domains/contacts/contact-members/contact-members.repository.js';
import { LeadsRepository } from './sub-domains/leads/leads.repository.js';
import { MembershipPreferencesRepository } from './sub-domains/memberships/membership-preferences/membership-preferences.repository.js';
import { MembershipSavedViewsRepository } from './sub-domains/memberships/membership-saved-views/membership-saved-views.repository.js';

/** The membership a part of the leave step releases: its organization's and its own internal id. */
export type EndedMembershipReference = { organizationId: number; membershipId: number };

/** One app sub-domain's part of the leave step (launch K4); runs in the ending transaction. */
export type MembershipLeavePart = (membership: EndedMembershipReference) => Promise<void>;

/**
 * The app's part of the one leave step (launch K4) — what tenancy's `MembershipService` runs when a
 * membership ends, whether the member is removed, leaves or deletes their account.
 *
 * @remarks
 * - **Algorithm:** runs each sub-domain's part in order, inside the organization transaction that
 *   ends the membership: what the person does now is cleared, what is theirs alone is deleted, and
 *   what they did stays (their records keep pointing at the ended membership).
 * - **Failure modes:** a part's error propagates and rolls the leave back.
 * - **Side effects:** each part writes its own sub-domain's tables.
 * - **Notes:** each app sub-domain adds its part to {@link createAppMembershipLeaveStep} as it is
 *   built (contact members, lead ownership, open tasks, personal settings, prescription kits).
 */
export class AppMembershipLeaveStep implements MembershipLeavePort {
  constructor(private readonly parts: readonly MembershipLeavePart[]) {}

  async releaseEndedMembership(membership: EndedMembershipReference): Promise<void> {
    for (const part of this.parts) await part(membership);
  }
}

/**
 * Builds the app's leave step from its sub-domains' parts. Repository-only, so the API and the
 * worker process (which re-drives a stuck account deletion) wire the same step.
 *
 * @remarks
 * Today's parts: sub-domain 1 — every branch's default staff naming them is cleared (C15); their
 * branch access rows stay, hidden while the membership is ended and back with a restore (D57).
 * Sub-domain 2 — their preferences and saved views are theirs alone and are deleted (U1); a restore
 * starts them from the defaults again. Sub-domain 4 — they stop handling every contact (their
 * `app.contact_members` rows are deleted, CT11). Sub-domain 5 — every lead they own returns to the
 * pool (no owner, no hold) and keeps them as involved (L9).
 */
export function createAppMembershipLeaveStep(): AppMembershipLeaveStep {
  const branchesRepository = new BranchesRepository();
  const membershipPreferencesRepository = new MembershipPreferencesRepository();
  const membershipSavedViewsRepository = new MembershipSavedViewsRepository();
  const contactMembersRepository = new ContactMembersRepository();
  const leadsRepository = new LeadsRepository();
  return new AppMembershipLeaveStep([
    ({ organizationId, membershipId }) =>
      branchesRepository.clearDefaultStaffForMembership({
        organization_id: organizationId,
        membership_id: membershipId,
      }),
    ({ organizationId, membershipId }) =>
      membershipPreferencesRepository.deleteForMembership({
        organization_id: organizationId,
        membership_id: membershipId,
      }),
    ({ organizationId, membershipId }) =>
      membershipSavedViewsRepository.deleteForMembership({
        organization_id: organizationId,
        membership_id: membershipId,
      }),
    ({ organizationId, membershipId }) =>
      contactMembersRepository.deleteForMembership({
        organization_id: organizationId,
        membership_id: membershipId,
      }),
    ({ organizationId, membershipId }) =>
      leadsRepository.releaseForMembership({
        organization_id: organizationId,
        membership_id: membershipId,
      }),
  ]);
}
